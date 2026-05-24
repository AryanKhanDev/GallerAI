"""
core/ingest/store.py
LanceDB interface — schema creation, upserts, and vector search.
"""

from __future__ import annotations

from typing import Optional

import lancedb
import numpy as np
import pyarrow as pa

from core.utils.config import CLIP_EMBED_DIM, DB_DIR, LANCE_TABLE_NAME
from core.utils.log import get_logger          # FIX: was logging.py
from core.utils.schemas import ImageRecord

logger = get_logger(__name__)

LANCE_SCHEMA = pa.schema([
    pa.field("id",               pa.string()),
    pa.field("path",             pa.string()),
    pa.field("filename",         pa.string()),
    pa.field("created_at",       pa.timestamp("us")),
    pa.field("modified_at",      pa.timestamp("us")),
    pa.field("file_size_bytes",  pa.int64()),
    pa.field("width",            pa.int32()),
    pa.field("height",           pa.int32()),
    pa.field("embedding",        pa.list_(pa.float32(), CLIP_EMBED_DIM)),
    pa.field("ocr_text",         pa.string()),
    pa.field("tags",             pa.list_(pa.string())),
    pa.field("indexed_at",       pa.timestamp("us")),
])


class ImageStore:
    """Thin wrapper around LanceDB for image records."""

    def __init__(self) -> None:
        self._db    = lancedb.connect(str(DB_DIR))
        self._table = self._get_or_create_table()

    def _get_or_create_table(self):
        if LANCE_TABLE_NAME in self._db.table_names():
            logger.debug(f"Opening existing table '{LANCE_TABLE_NAME}'")
            return self._db.open_table(LANCE_TABLE_NAME)
        logger.info(f"Creating new table '{LANCE_TABLE_NAME}'")
        return self._db.create_table(LANCE_TABLE_NAME, schema=LANCE_SCHEMA)

    def upsert(self, records: list[ImageRecord]) -> None:
        if not records:
            return
        existing_ids = self._existing_ids()
        new_records  = [r for r in records if r.id not in existing_ids]
        if not new_records:
            logger.debug("All records already in store — nothing to upsert")
            return
        self._table.add([_record_to_row(r) for r in new_records])
        logger.info(f"Stored {len(new_records)} new records")

    def _existing_ids(self) -> set[str]:
        try:
            return set(self._table.to_pandas(columns=["id"])["id"].tolist())
        except Exception:
            return set()

    def vector_search(self, query_embedding: np.ndarray, top_k: int = 20) -> list[dict]:
        return (
            self._table
            .search(query_embedding.tolist())
            .limit(top_k)
            .to_pandas()
            .to_dict(orient="records")
        )

    def get_all(self) -> list[dict]:
        return self._table.to_pandas().to_dict(orient="records")

    def count(self) -> int:
        return len(self._table.to_pandas())


def _record_to_row(r: ImageRecord) -> dict:
    return {
        "id":               r.id,
        "path":             r.path,
        "filename":         r.filename,
        "created_at":       r.created_at,
        "modified_at":      r.modified_at,
        "file_size_bytes":  r.file_size_bytes,
        "width":            r.width or 0,
        "height":           r.height or 0,
        "embedding":        r.embedding if r.embedding else [0.0] * CLIP_EMBED_DIM,
        "ocr_text":         r.ocr_text or "",
        "tags":             r.tags,
        "indexed_at":       r.indexed_at,
    }