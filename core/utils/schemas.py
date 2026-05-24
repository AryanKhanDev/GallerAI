"""
core/utils/schemas.py
Typed contracts for the entire pipeline. Everything flows through these.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Storage record — one per image in LanceDB
# ---------------------------------------------------------------------------

class ImageRecord(BaseModel):
    id: str                              # sha256 hash of file content
    path: str                            # absolute path on device
    filename: str
    created_at: datetime
    modified_at: datetime
    file_size_bytes: int
    width: Optional[int] = None
    height: Optional[int] = None
    embedding: list[float] = Field(default_factory=list)   # CLIP 512-d
    ocr_text: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    indexed_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Query system
# ---------------------------------------------------------------------------

class ExpertType(str, Enum):
    METADATA = "metadata"
    SEMANTIC  = "semantic"
    OCR       = "ocr"
    TAGS      = "tags"


class DateFilter(BaseModel):
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    label: Optional[str] = None


class ParsedQuery(BaseModel):
    raw: str
    experts: list[ExpertType]
    semantic_text: Optional[str] = None
    date_filter: Optional[DateFilter] = None
    ocr_keywords: list[str] = Field(default_factory=list)
    tag_keywords: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Retrieval results
# ---------------------------------------------------------------------------

class ExpertScore(BaseModel):
    expert: ExpertType
    score: float


class RetrievalResult(BaseModel):
    record: ImageRecord
    final_score: float
    expert_scores: list[ExpertScore] = Field(default_factory=list)

    def debug_str(self) -> str:
        scores = " | ".join(
            f"{s.expert.value}={s.score:.3f}" for s in self.expert_scores
        )
        return f"[{self.final_score:.3f}] {self.record.filename}  ({scores})"


class QueryResult(BaseModel):
    query: ParsedQuery
    results: list[RetrievalResult]
    latency_ms: float