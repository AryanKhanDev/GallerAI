"""
core/ingest/store.py
Dense OCR compatible LanceDB storage.

Trash/Bin: `is_deleted` is a column on every row (soft-delete flag).
get_all() excludes soft-deleted rows by default, so every existing
caller (gallery listing, retriever's semantic/OCR/metadata scoring,
/upload's dedup check) stays correct automatically — nothing else in
the codebase needs to know Bin exists unless it explicitly opts in
via include_deleted=True.
"""

from __future__ import annotations

import lancedb
import pyarrow as pa

from core.utils.config import (
    CLIP_EMBED_DIM,
    DB_DIR,
    LANCE_TABLE_NAME,
)
from core.utils.log import get_logger
from core.utils.schemas import (
    ImageRecord,
)

logger = get_logger(__name__)

LANCE_SCHEMA = pa.schema([

    pa.field(
        "id",
        pa.string(),
    ),

    pa.field(
        "path",
        pa.string(),
    ),

    pa.field(
        "filename",
        pa.string(),
    ),

    pa.field(
        "created_at",
        pa.timestamp("us"),
    ),

    pa.field(
        "modified_at",
        pa.timestamp("us"),
    ),

    pa.field(
        "file_size_bytes",
        pa.int64(),
    ),

    pa.field(
        "width",
        pa.int32(),
    ),

    pa.field(
        "height",
        pa.int32(),
    ),

    pa.field(
        "embedding",
        pa.list_(
            pa.float32(),
            CLIP_EMBED_DIM,
        ),
    ),

    pa.field(
        "ocr_text",
        pa.string(),
    ),

    # NEW dense OCR
    pa.field(
        "ocr_embedding",
        pa.list_(
            pa.float32(),
            CLIP_EMBED_DIM,
        ),
    ),

    # compatibility only
    pa.field(
        "ocr_chunks",
        pa.list_(
            pa.string()
        ),
    ),

    pa.field(
        "ocr_chunk_embeddings",
        pa.list_(
            pa.list_(
                pa.float32(),
                CLIP_EMBED_DIM,
            )
        ),
    ),

    pa.field(
        "tags",
        pa.list_(
            pa.string()
        ),
    ),

    # NEW — Trash/Bin soft-delete flag
    pa.field(
        "is_deleted",
        pa.bool_(),
    ),

    pa.field(
        "indexed_at",
        pa.timestamp("us"),
    ),
])


class ImageStore:

    def __init__(self):
        self._db = lancedb.connect(str(DB_DIR))
        try:
            self._table = self._db.open_table(LANCE_TABLE_NAME)
            self._ensure_is_deleted_column()
        except Exception:
            self._table = self._db.create_table(
            LANCE_TABLE_NAME,
            schema=LANCE_SCHEMA,
        )

    def _ensure_is_deleted_column(self) -> None:
        """
        Migration safety net for tables created before Bin existed.
        Adds is_deleted (defaulting to False) if missing, so you don't
        need to wipe and re-ingest your existing index.
        """
        try:
            existing_cols = set(self._table.schema.names)
            if "is_deleted" not in existing_cols:
                logger.info("Migrating table: adding is_deleted column")
                self._table.add_columns({"is_deleted": "CAST(false AS BOOLEAN)"})
        except Exception as e:
            logger.warning(f"is_deleted migration skipped/failed: {e}")

    def upsert(
        self,
        records,
    ):
        self._table.add(
            [
                _record_to_row(r)
                for r in records
            ]
        )

    def get_all(self, include_deleted: bool = False):
        """
        Returns all indexed rows. By default excludes soft-deleted
        (Bin) rows — this is the single choke point every read path
        goes through, so deleted images vanish from gallery/search/
        chat automatically with no changes needed elsewhere.
        """
        records = (
            self._table
            .to_pandas()
            .to_dict(
                orient="records"
            )
        )
        if include_deleted:
            return records
        return [r for r in records if not bool(r.get("is_deleted", False))]

    def get_bin(self):
        """Returns only soft-deleted rows — the contents of the Bin."""
        records = (
            self._table
            .to_pandas()
            .to_dict(
                orient="records"
            )
        )
        return [r for r in records if bool(r.get("is_deleted", False))]

    def get_by_id(self, image_id: str, include_deleted: bool = True):
        records = self.get_all(include_deleted=include_deleted)
        return next((r for r in records if r["id"] == image_id), None)

    def count(self):
        return len(
            self.get_all()
        )

    # -------------------------------------------------------------------
    # Bin mutators
    # -------------------------------------------------------------------

    def set_deleted(self, image_id: str, deleted: bool) -> bool:
        """
        Move an image into the Bin (deleted=True) or restore it
        (deleted=False). Never touches the file on disk, embeddings,
        OCR data, or album membership — so restore is a full, instant
        undo.
        """
        if self.get_by_id(image_id) is None:
            return False
        try:
            self._table.update(
                where=f"id = '{image_id}'",
                values={"is_deleted": deleted},
            )
            return True
        except Exception as e:
            logger.warning(f"set_deleted({image_id}, {deleted}) failed: {e}")
            return False

    def permanently_delete(self, image_id: str) -> bool:
        """
        Irreversibly removes the row: embedding, OCR text/embedding,
        tags, metadata — everything. Caller is responsible for
        stripping the id from album image_ids first.
        """
        if self.get_by_id(image_id) is None:
            return False
        try:
            self._table.delete(f"id = '{image_id}'")
            return True
        except Exception as e:
            logger.warning(f"permanently_delete({image_id}) failed: {e}")
            return False


def _record_to_row(
    r: ImageRecord,
):

    return dict(
        id=r.id,
        path=r.path,
        filename=r.filename,
        created_at=r.created_at,
        modified_at=r.modified_at,
        file_size_bytes=r.file_size_bytes,
        width=r.width or 0,
        height=r.height or 0,

        embedding=r.embedding,

        ocr_text=r.ocr_text,

        # NEW
        ocr_embedding=r.ocr_embedding,

        # compatibility only
        ocr_chunks=r.ocr_chunks,
        ocr_chunk_embeddings=[],

        tags=r.tags,

        is_deleted=getattr(r, "is_deleted", False),

        indexed_at=r.indexed_at,
    )
