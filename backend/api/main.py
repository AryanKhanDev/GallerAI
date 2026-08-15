"""
api/main.py
GallерAI FastAPI server — Stage 2 + Trash/Bin.

Endpoints:
  GET  /health                    → server status
  POST /query                     → semantic + OCR image retrieval
  GET  /image/{image_id}          → serve full image by hash id
  GET  /thumbnail/{image_id}      → serve resized thumbnail (300px)
  GET  /images                    → list all indexed images
  POST /upload                    → upload + index a single image
  POST /ingest                    → trigger indexing of a directory
  GET  /albums                    → list all albums (Bin always first)
  POST /albums                    → create album (manual or auto from query)
  GET  /albums/{album_id}         → get album contents (id="bin" works)
  PATCH /albums/{album_id}        → rename album
  POST /albums/{album_id}/add     → add images to album
  DELETE /albums/{album_id}/images/{image_id}  → remove image from album
  DELETE /albums/{album_id}       → delete album

  POST   /images/{image_id}/delete     → soft-delete (move to Bin)
  POST   /images/{image_id}/restore    → restore from Bin
  DELETE /images/{image_id}/permanent  → permanently delete (irreversible)
  GET    /bin                          → list Bin contents
  POST   /bin/clear                    → permanently delete everything in Bin

Run from repo root:
    uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from PIL import Image as PILImage
from pydantic import BaseModel

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.ingest.store import ImageStore
from core.retrieve.retriever import Retriever
from core.retrieve.router import parse_query
from core.utils.config import CACHE_DIR, UPLOAD_DIR
from core.utils.log import get_logger
from core.utils.schemas import ImageRecord, QueryResult

logger = get_logger("api")

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="GallерAI",
    description="Local-first AI-powered image retrieval",
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten for production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

_store: Optional[ImageStore] = None
_retriever: Optional[Retriever] = None
_ingest_status: dict = {"running": False, "message": "idle", "indexed": 0}
_albums_path = CACHE_DIR / "albums.json"

BIN_ALBUM_ID = "bin"


def get_store() -> ImageStore:
    global _store
    if _store is None:
        _store = ImageStore()
    return _store


def get_retriever() -> Retriever:
    global _retriever
    if _retriever is None:
        _retriever = Retriever(get_store())
    return _retriever


def _invalidate_retriever() -> None:
    global _retriever
    _retriever = None


# ---------------------------------------------------------------------------
# Album persistence (simple JSON file — no extra DB needed)
#
# NOTE: the Bin is intentionally NOT stored here. It is a virtual
# album, derived live from ImageStore.get_bin() (i.e. from each
# image's is_deleted flag). This keeps deletion state single-sourced
# instead of syncing membership between albums.json and image rows.
# ---------------------------------------------------------------------------

def _load_albums() -> dict:
    if _albums_path.exists():
        try:
            return json.loads(_albums_path.read_text())
        except Exception:
            pass
    return {}


def _save_albums(albums: dict) -> None:
    _albums_path.write_text(json.dumps(albums, indent=2))


def _strip_image_from_albums(image_id: str) -> None:
    """Remove an image id from every real (non-Bin) album's membership.
    Used before a permanent delete so albums never reference a row
    that no longer exists."""
    albums = _load_albums()
    changed = False
    for album in albums.values():
        if image_id in album.get("image_ids", []):
            album["image_ids"] = [i for i in album["image_ids"] if i != image_id]
            if album.get("cover_image_id") == image_id:
                remaining = album["image_ids"]
                album["cover_image_id"] = remaining[0] if remaining else None
            changed = True
    if changed:
        _save_albums(albums)


def _bin_album() -> dict:
    """Builds the virtual Bin album object on demand from current
    is_deleted rows. Always appears first in /albums; cannot be
    renamed or deleted (enforced at the endpoint level below)."""
    store = get_store()
    bin_records = store.get_bin()
    ids = [r["id"] for r in bin_records]
    return {
        "id": BIN_ALBUM_ID,
        "name": "🗑 Bin",
        "description": "Deleted images. Restore them or delete permanently.",
        "query": None,
        "image_ids": ids,
        "created_at": datetime.min.replace(tzinfo=timezone.utc).isoformat(),
        "cover_image_id": ids[0] if ids else None,
        "is_system": True,
    }


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    query: str
    top_k: int = 20
    mode: str = "chat"   # chat | gallery

class ImageResult(BaseModel):
    id: str
    filename: str
    path: str
    score: float
    semantic_score: Optional[float] = None
    ocr_score: Optional[float] = None
    metadata_score: Optional[float] = None
    ocr_text: Optional[str] = None
    created_at: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    thumbnail_url: str
    image_url: str


class QueryResponse(BaseModel):
    query: str
    experts: list[str]
    results: list[ImageResult]
    latency_ms: float
    total: int


class IngestRequest(BaseModel):
    directory: str
    use_ocr: bool = True


class IngestResponse(BaseModel):
    status: str
    message: str


class AlbumCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    image_ids: list[str] = []          # pre-populate from query results
    query: Optional[str] = None        # optional: record the query that made it


class AlbumAddRequest(BaseModel):
    image_ids: list[str]

class AlbumUpdateRequest(BaseModel):
    name: str

class Album(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    query: Optional[str] = None
    image_ids: list[str]
    created_at: str
    cover_image_id: Optional[str] = None
    is_system: bool = False   # True only for Bin — client hides rename/delete UI


class DeleteImageResponse(BaseModel):
    id: str
    deleted: bool


class RestoreImageResponse(BaseModel):
    id: str
    restored: bool


class PermanentDeleteResponse(BaseModel):
    id: str
    permanently_deleted: bool


class ClearBinResponse(BaseModel):
    deleted: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _result_to_response(r, base_url: str = "") -> ImageResult:
    rec = r.record
    scores = {s.expert.value: s.score for s in r.expert_scores}
    return ImageResult(
        id=rec.id,
        filename=rec.filename,
        path=rec.path,
        score=r.final_score,
        semantic_score=scores.get("semantic"),
        ocr_score=scores.get("ocr"),
        metadata_score=scores.get("metadata"),
        ocr_text=rec.ocr_text,
        created_at=rec.created_at.isoformat() if rec.created_at else None,
        width=rec.width,
        height=rec.height,
        thumbnail_url=f"http://localhost:8000/thumbnail/{rec.id}",
        image_url=f"http://localhost:8000/image/{rec.id}",
    )


def _gallery_image_response(record: dict) -> dict:
    created = record["created_at"]
    return {
        "id": record["id"],
        "filename": record["filename"],
        "path": record["path"],
        "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
        "width": record.get("width"),
        "height": record.get("height"),
        "has_ocr": bool(record.get("ocr_text")),
        "thumbnail_url": f"http://localhost:8000/thumbnail/{record['id']}",
        "image_url": f"http://localhost:8000/image/{record['id']}",
    }


def _serve_image(image_id: str, max_size: Optional[int] = None) -> Response:
    store = get_store()
    # include_deleted: images sitting in the Bin must still be
    # viewable (thumbnails, previews) until they're permanently deleted.
    record = store.get_by_id(image_id, include_deleted=True)

    if not record:
        raise HTTPException(status_code=404, detail="Image not found")

    path = Path(record["path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found on disk: {path}")

    try:
        img = PILImage.open(path).convert("RGB")

        if max_size:
            img.thumbnail((max_size, max_size), PILImage.LANCZOS)

        buf = io.BytesIO()
        fmt = "JPEG" if path.suffix.lower() not in {".png"} else "PNG"
        img.save(buf, format=fmt, quality=85)
        buf.seek(0)

        media_type = "image/jpeg" if fmt == "JPEG" else "image/png"
        return Response(content=buf.read(), media_type=media_type)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not open image: {e}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    store = get_store()
    return {
        "status": "ok",
        "indexed": store.count(),
        "ingest": _ingest_status,
        "version": "0.3.0",
    }


@app.post("/query", response_model=QueryResponse)
def query(req: QueryRequest):
    if not req.query.strip():
        raise HTTPException(
            status_code=400,
            detail="Query cannot be empty",
        )

    parsed = parse_query(req.query)
    retriever = get_retriever()

    result = retriever.search(
    parsed,
    top_k=req.top_k,
    mode=req.mode,
)

    return QueryResponse(
        query=req.query,
        experts=[e.value for e in parsed.experts],
        results=[
            _result_to_response(r)
            for r in result.results
        ],
        latency_ms=round(
            result.latency_ms,
            1,
        ),
        total=len(result.results),
    )


@app.get("/image/{image_id}")
def get_image(image_id: str):
    return _serve_image(image_id, max_size=None)


@app.get("/thumbnail/{image_id}")
def get_thumbnail(image_id: str):
    return _serve_image(image_id, max_size=300)


@app.get("/images")
def list_images(limit: int = 100, offset: int = 0):
    store = get_store()
    # get_all() defaults to excluding Bin contents
    all_records = store.get_all()
    total = len(all_records)
    page = all_records[offset : offset + limit]

    results = [_gallery_image_response(r) for r in page]

    return {"total": total, "offset": offset, "limit": limit, "images": results}


# ---------------------------------------------------------------------------
# Single image upload (camera / library)
# ---------------------------------------------------------------------------

@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    file_hash = hashlib.sha256(raw).hexdigest()
    orig_name = file.filename or f"upload_{file_hash[:8]}.jpg"
    ext = Path(orig_name).suffix.lower() or ".jpg"
    saved_path = UPLOAD_DIR / f"{file_hash}{ext}"

    store = get_store()

    # Dedup: if this exact file is already indexed, just return it —
    # no re-embedding, no duplicate on disk. include_deleted=True so
    # this also catches a file that was previously moved to the Bin;
    # re-uploading something you'd deleted should bring it back rather
    # than silently insert a duplicate row with the same id.
    existing = store.get_by_id(file_hash, include_deleted=True)
    if existing:
        if existing.get("is_deleted"):
            store.set_deleted(file_hash, False)
            _invalidate_retriever()
            existing["is_deleted"] = False
        return _gallery_image_response(existing)

    saved_path.write_bytes(raw)

    try:
        img = PILImage.open(saved_path).convert("RGB")
    except Exception as e:
        saved_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    from core.embed.clip_encoder import embed_images, embed_text
    from core.embed.ocr_extractor import batch_extract
    from core.utils.config import CLIP_EMBED_DIM
    import numpy as np

    now = datetime.now(timezone.utc)

    rec = ImageRecord(
        id=file_hash,
        path=str(saved_path.resolve()),
        filename=orig_name,
        created_at=now,
        modified_at=now,
        file_size_bytes=len(raw),
        width=img.width,
        height=img.height,
    )

    img_embs = embed_images([img])
    rec.embedding = img_embs[0].tolist() if len(img_embs) else []

    chunks = batch_extract([img])[0]
    rec.ocr_chunks = chunks
    rec.ocr_chunk_embeddings = []
    if chunks:
        ocr_text = " ".join(chunks).strip()
        rec.ocr_text = ocr_text
        rec.ocr_embedding = embed_text(ocr_text).tolist()
    else:
        rec.ocr_text = None
        rec.ocr_embedding = np.zeros(CLIP_EMBED_DIM, dtype=np.float32).tolist()

    store.upsert([rec])

    # Invalidate retriever so it picks up the new image
    _invalidate_retriever()

    logger.info(f"Uploaded + indexed image: {orig_name} ({file_hash[:8]})")

    return {
        "id": rec.id,
        "filename": rec.filename,
        "path": rec.path,
        "created_at": rec.created_at.isoformat(),
        "width": rec.width,
        "height": rec.height,
        "has_ocr": bool(rec.ocr_text),
        "thumbnail_url": f"http://localhost:8000/thumbnail/{rec.id}",
        "image_url": f"http://localhost:8000/image/{rec.id}",
    }


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

def _run_ingest(directory: str, use_ocr: bool) -> None:
    global _ingest_status, _store
    try:
        _ingest_status = {"running": True, "message": "Scanning directory…", "indexed": 0}

        from PIL import Image as PILImage
        from core.embed.clip_encoder import embed_images
        from core.embed.ocr_extractor import batch_extract
        from core.ingest.scanner import scan_directory
        from core.utils.config import CLIP_EMBED_DIM
        import numpy as np

        store = get_store()
        records = list(scan_directory(directory))

        if not records:
            _ingest_status = {"running": False, "message": "Nothing new to index.", "indexed": 0}
            return

        _ingest_status["message"] = f"Embedding {len(records)} images…"

        images = []
        for r in records:
            try:
                images.append(PILImage.open(r.path).convert("RGB"))
            except Exception:
                images.append(None)

        valid = [i for i in images if i is not None]
        img_embs = embed_images(valid)

        chunk_lists = batch_extract(valid) if use_ocr else [[] for _ in valid]

        _ingest_status["message"] = "Storing records…"

        zero_vec = np.zeros(CLIP_EMBED_DIM, dtype=np.float32).tolist()
        from core.embed.clip_encoder import embed_text

        emb_i = 0
        for i, r in enumerate(records):
            if images[i] is None:
                continue
            r.embedding = img_embs[emb_i].tolist()
            chunks = chunk_lists[emb_i]
            r.ocr_chunks = chunks
            r.ocr_chunk_embeddings = []
            if chunks:
                ocr_text = " ".join(chunks).strip()
                r.ocr_text = ocr_text
                r.ocr_embedding = embed_text(ocr_text).tolist()
            else:
                r.ocr_text = None
                r.ocr_embedding = zero_vec
            r.is_deleted = False
            emb_i += 1

        store.upsert(records)

        # Invalidate retriever so it picks up new records
        _invalidate_retriever()

        count = store.count()
        _ingest_status = {
            "running": False,
            "message": f"Done. {len(records)} new images indexed.",
            "indexed": count,
        }
        logger.info(f"Ingest complete — store now has {count} images")

    except Exception as e:
        logger.error(f"Ingest failed: {e}")
        _ingest_status = {"running": False, "message": f"Error: {e}", "indexed": 0}


@app.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest, background_tasks: BackgroundTasks):
    if _ingest_status.get("running"):
        return IngestResponse(status="busy", message="Ingest already running")

    path = Path(req.directory)
    if not path.exists():
        raise HTTPException(status_code=400, detail=f"Directory not found: {req.directory}")

    background_tasks.add_task(_run_ingest, req.directory, req.use_ocr)
    return IngestResponse(status="started", message=f"Indexing {req.directory} in background")


@app.get("/ingest/status")
def ingest_status():
    return _ingest_status


# ---------------------------------------------------------------------------
# Albums
# ---------------------------------------------------------------------------

@app.get("/albums")
def list_albums():
    albums = _load_albums()
    # Bin is always first, always present, never persisted to disk
    all_albums = [_bin_album()] + list(albums.values())
    return {"albums": all_albums, "total": len(all_albums)}


@app.post("/albums", response_model=Album)
def create_album(req: AlbumCreateRequest):
    albums = _load_albums()
    album_id = str(uuid.uuid4())[:8]

    album = Album(
        id=album_id,
        name=req.name,
        description=req.description,
        query=req.query,
        image_ids=list(dict.fromkeys(req.image_ids)),  # dedupe, preserve order
        created_at=datetime.now(timezone.utc).isoformat(),
        cover_image_id=req.image_ids[0] if req.image_ids else None,
    )

    albums[album_id] = album.model_dump()
    _save_albums(albums)
    logger.info(f"Album created: '{req.name}' ({len(req.image_ids)} images)")
    return album


@app.get("/albums/{album_id}", response_model=Album)
def get_album(album_id: str):
    if album_id == BIN_ALBUM_ID:
        return _bin_album()

    albums = _load_albums()
    if album_id not in albums:
        raise HTTPException(status_code=404, detail="Album not found")
    return albums[album_id]


@app.post("/albums/{album_id}/add")
def add_to_album(album_id: str, req: AlbumAddRequest):
    if album_id == BIN_ALBUM_ID:
        raise HTTPException(
            status_code=400,
            detail="Can't add images to Bin directly — delete the image instead.",
        )

    albums = _load_albums()
    if album_id not in albums:
        raise HTTPException(status_code=404, detail="Album not found")

    existing = albums[album_id]["image_ids"]
    new_ids  = [i for i in req.image_ids if i not in existing]
    albums[album_id]["image_ids"].extend(new_ids)

    if not albums[album_id].get("cover_image_id") and new_ids:
        albums[album_id]["cover_image_id"] = new_ids[0]

    _save_albums(albums)
    return {"added": len(new_ids), "total": len(albums[album_id]["image_ids"])}

@app.patch("/albums/{album_id}",
           response_model=Album)
def rename_album(
    album_id: str,
    req: AlbumUpdateRequest
):
    if album_id == BIN_ALBUM_ID:
        raise HTTPException(
            status_code=400,
            detail="Bin cannot be renamed"
        )

    albums = _load_albums()

    if album_id not in albums:
        raise HTTPException(
            status_code=404,
            detail="Album not found"
        )

    albums[album_id]["name"] = (
        req.name.strip()
    )

    _save_albums(
        albums
    )

    return albums[
        album_id
    ]

@app.delete("/albums/{album_id}/images/{image_id}")
def remove_from_album(album_id: str, image_id: str):
    if album_id == BIN_ALBUM_ID:
        raise HTTPException(
            status_code=400,
            detail="Can't remove images from Bin directly — restore the image instead.",
        )

    albums = _load_albums()
    if album_id not in albums:
        raise HTTPException(status_code=404, detail="Album not found")

    before = len(albums[album_id]["image_ids"])
    albums[album_id]["image_ids"] = [
        i for i in albums[album_id]["image_ids"] if i != image_id
    ]
    removed = before - len(albums[album_id]["image_ids"])

    # Update cover if removed
    if albums[album_id].get("cover_image_id") == image_id:
        remaining = albums[album_id]["image_ids"]
        albums[album_id]["cover_image_id"] = remaining[0] if remaining else None

    _save_albums(albums)
    return {"removed": removed, "total": len(albums[album_id]["image_ids"])}


@app.delete("/albums/{album_id}")
def delete_album(album_id: str):
    """
    Deletes only the album object (the collection). Every image
    contained in it stays fully intact — on disk, in LanceDB, in
    semantic/OCR indexes, and in every other album it also belongs
    to. This is NOT soft delete; there is nothing to restore because
    nothing about the images themselves changed.
    """
    if album_id == BIN_ALBUM_ID:
        raise HTTPException(status_code=400, detail="Bin cannot be deleted")

    albums = _load_albums()
    if album_id not in albums:
        raise HTTPException(status_code=404, detail="Album not found")
    name = albums[album_id]["name"]
    del albums[album_id]
    _save_albums(albums)
    return {"deleted": album_id, "name": name}


# ---------------------------------------------------------------------------
# Trash / Bin — per-image soft delete, restore, permanent delete
# ---------------------------------------------------------------------------

@app.post("/images/{image_id}/delete", response_model=DeleteImageResponse)
def delete_image(image_id: str):
    """
    Soft delete: moves the image into the Bin. It immediately
    disappears from /images, /query, and every normal album view, but
    the file on disk and all indexed data are untouched — fully
    reversible via /images/{id}/restore.
    """
    store = get_store()
    if not store.set_deleted(image_id, True):
        raise HTTPException(status_code=404, detail="Image not found")

    _invalidate_retriever()
    logger.info(f"Image {image_id} moved to Bin")
    return DeleteImageResponse(id=image_id, deleted=True)


@app.post("/images/{image_id}/restore", response_model=RestoreImageResponse)
def restore_image(image_id: str):
    """
    Restores an image out of the Bin. It becomes visible again in the
    gallery, search, chat, and any album it previously belonged to
    (album membership was never touched by the delete).
    """
    store = get_store()
    if not store.set_deleted(image_id, False):
        raise HTTPException(status_code=404, detail="Image not found")

    _invalidate_retriever()
    logger.info(f"Image {image_id} restored from Bin")
    return RestoreImageResponse(id=image_id, restored=True)


@app.delete("/images/{image_id}/permanent", response_model=PermanentDeleteResponse)
def permanently_delete_image(image_id: str):
    """
    Irreversibly removes the image: LanceDB row (embedding, OCR text,
    OCR embedding, metadata), and its id from every album's
    image_ids. Does not require the image to currently be in the Bin,
    but the UI should only expose this action from inside Bin.
    """
    store = get_store()
    record = store.get_by_id(image_id, include_deleted=True)
    if not record:
        raise HTTPException(status_code=404, detail="Image not found")

    _strip_image_from_albums(image_id)

    if not store.permanently_delete(image_id):
        raise HTTPException(status_code=500, detail="Could not permanently delete image")

    _invalidate_retriever()
    logger.info(f"Image {image_id} permanently deleted")
    return PermanentDeleteResponse(id=image_id, permanently_deleted=True)


@app.get("/bin")
def list_bin(limit: int = 200, offset: int = 0):
    """Lists the contents of the Bin (paginated), same shape as /images."""
    store = get_store()
    bin_records = store.get_bin()
    total = len(bin_records)
    page = bin_records[offset : offset + limit]

    results = [_gallery_image_response(r) for r in page]

    return {"total": total, "offset": offset, "limit": limit, "images": results}


@app.post("/bin/clear", response_model=ClearBinResponse)
def clear_bin():
    """
    Permanently deletes every image currently in the Bin. Irreversible.
    The client is expected to confirm with the user before calling
    this ("Delete all items permanently? This cannot be undone.").
    """
    store = get_store()
    ids = [r["id"] for r in store.get_bin()]

    deleted_count = 0
    for image_id in ids:
        _strip_image_from_albums(image_id)
        if store.permanently_delete(image_id):
            deleted_count += 1

    _invalidate_retriever()
    logger.info(f"Bin cleared — {deleted_count} images permanently deleted")
    return ClearBinResponse(deleted=deleted_count)
