"""
core/utils/schemas.py
Typed contracts for entire pipeline.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ImageRecord(BaseModel):

    id: str
    path: str
    filename: str

    created_at: datetime
    modified_at: datetime

    file_size_bytes: int

    width: Optional[int] = None
    height: Optional[int] = None

    embedding: list[float] = Field(
        default_factory=list
    )

    ocr_text: Optional[str] = None

    # NEW dense OCR embedding
    ocr_embedding: list[float] = Field(
        default_factory=list
    )

    # compatibility only
    ocr_chunks: list[str] = Field(
        default_factory=list
    )

    # compatibility only
    ocr_chunk_embeddings: list[
        list[float]
    ] = Field(
        default_factory=list
    )

    tags: list[str] = Field(
        default_factory=list
    )

    indexed_at: datetime = Field(
        default_factory=datetime.utcnow
    )


class ExpertType(str, Enum):
    METADATA = "metadata"
    SEMANTIC = "semantic"
    OCR = "ocr"
    TAGS = "tags"


class DateFilter(BaseModel):
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    label: Optional[str] = None


class ParsedQuery(BaseModel):
    raw: str
    experts: list[ExpertType]
    semantic_text: Optional[str] = None
    date_filter: Optional[DateFilter] = None
    ocr_keywords: list[str] = Field(
        default_factory=list
    )
    tag_keywords: list[str] = Field(
        default_factory=list
    )


class ExpertScore(BaseModel):
    expert: ExpertType
    score: float


class RetrievalResult(BaseModel):
    record: ImageRecord
    final_score: float
    expert_scores: list[
        ExpertScore
    ] = Field(
        default_factory=list
    )


class QueryResult(BaseModel):
    query: ParsedQuery
    results: list[RetrievalResult]
    latency_ms: float