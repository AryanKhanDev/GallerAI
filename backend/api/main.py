"""
api/main.py
GallерAI FastAPI server — Stage 2.

Endpoints:
  GET  /health                    → server status
  POST /query                     → semantic + OCR image retrieval
  GET  /image/{image_id}          → serve full image by hash id
  GET  /thumbnail/{image_id}      → serve resized thumbnail (300px)
  GET  /images                    → list all indexed images
  POST /ingest                    → trigger indexing of a directory
  GET  /albums                    → list all albums
  POST /albums                    → create album (manual or auto from query)
  GET  /albums/{album_id}         → get album contents
  POST /albums/{album_id}/add     → add images to album
  DELETE /albums/{album_id}/images/{image_id}  → remove image from album
  DELETE /albums/{album_id}       → delete album

Run from repo root:
    uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import io
import json
import sys
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from PIL import Image as PILImage
from pydantic import BaseModel

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.ingest.store import ImageStore
from core.retrieve.retriever import Retriever
from core.retrieve.router import parse_query
from core.utils.config import CACHE_DIR
from core.utils.log import get_logger
from core.utils.schemas import QueryResult

logger = get_logger("api")

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="GallерAI",
    description="Local-first AI-powered image retrieval",
    version="0.2.0",
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


# ---------------------------------------------------------------------------
# Album persistence (simple JSON file — no extra DB needed)
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


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    query: str
    top_k: int = 20


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


class Album(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    query: Optional[str] = None
    image_ids: list[str]
    created_at: str
    cover_image_id: Optional[str] = None


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
        thumbnail_url=f"/thumbnail/{rec.id}",
        image_url=f"/image/{rec.id}",
    )


def _serve_image(image_id: str, max_size: Optional[int] = None) -> Response:
    store = get_store()
    all_records = store.get_all()
    record = next((r for r in all_records if r["id"] == image_id), None)

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
        "version": "0.2.0",
    }


@app.post("/query", response_model=QueryResponse)
def query(req: QueryRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    parsed    = parse_query(req.query)
    retriever = get_retriever()
    result    = retriever.search(parsed, top_k=req.top_k)

    return QueryResponse(
        query=req.query,
        experts=[e.value for e in parsed.experts],
        results=[_result_to_response(r) for r in result.results],
        latency_ms=round(result.latency_ms, 1),
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
    all_records = store.get_all()
    total = len(all_records)
    page = all_records[offset : offset + limit]

    results = []
    for r in page:
        results.append({
            "id":           r["id"],
            "filename":     r["filename"],
            "path":         r["path"],
            "created_at":   r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
            "width":        r.get("width"),
            "height":       r.get("height"),
            "has_ocr":      bool(r.get("ocr_text")),
            "thumbnail_url": f"/thumbnail/{r['id']}",
            "image_url":     f"/image/{r['id']}",
        })

    return {"total": total, "offset": offset, "limit": limit, "images": results}


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

def _run_ingest(directory: str, use_ocr: bool) -> None:
    global _ingest_status, _store, _retriever
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
            emb_i += 1

        store.upsert(records)

        # Invalidate retriever so it picks up new records
        _retriever = None

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
    return {"albums": list(albums.values()), "total": len(albums)}


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
    albums = _load_albums()
    if album_id not in albums:
        raise HTTPException(status_code=404, detail="Album not found")
    return albums[album_id]


@app.post("/albums/{album_id}/add")
def add_to_album(album_id: str, req: AlbumAddRequest):
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


@app.delete("/albums/{album_id}/images/{image_id}")
def remove_from_album(album_id: str, image_id: str):
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
    albums = _load_albums()
    if album_id not in albums:
        raise HTTPException(status_code=404, detail="Album not found")
    name = albums[album_id]["name"]
    del albums[album_id]
    _save_albums(albums)
    return {"deleted": album_id, "name": name}