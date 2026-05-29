"""
core/ingest/store.py
Dense OCR compatible LanceDB storage.
"""

from __future__ import annotations

import lancedb
import pyarrow as pa

from core.utils.config import (
    CLIP_EMBED_DIM,
    DB_DIR,
    LANCE_TABLE_NAME,
)
from core.utils.schemas import (
    ImageRecord,
)

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
        except Exception:
            self._table = self._db.create_table(
            LANCE_TABLE_NAME,
            schema=LANCE_SCHEMA,
        )

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

    def get_all(self):
        return (
            self._table
            .to_pandas()
            .to_dict(
                orient="records"
            )
        )

    def count(self):
        return len(
            self._table.to_pandas()
        )


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
        indexed_at=r.indexed_at,
    )