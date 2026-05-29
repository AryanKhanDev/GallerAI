"""
core/retrieve/retriever.py — helper (separate to avoid circular import)
"""
from core.utils.schemas import ImageRecord
from datetime import datetime


def _row_to_record(row: dict) -> ImageRecord:
    def _dt(v):
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            return datetime.fromisoformat(v)
        if hasattr(v, "to_pydatetime"):
            return v.to_pydatetime()
        return datetime.utcnow()

    return ImageRecord(
        id=row["id"],
        path=row["path"],
        filename=row["filename"],
        created_at=_dt(row["created_at"]),
        modified_at=_dt(row["modified_at"]),
        file_size_bytes=int(row["file_size_bytes"]),
        width=row.get("width"),
        height=row.get("height"),
        embedding=list(row.get("embedding") or []),
        ocr_text=row.get("ocr_text") or None,
        tags=list(row.get("tags") or []),
        indexed_at=_dt(row.get("indexed_at", datetime.utcnow())),
    )
