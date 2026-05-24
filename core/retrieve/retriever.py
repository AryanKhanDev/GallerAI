"""
core/retrieve/retriever.py
Hybrid retrieval engine. Runs relevant experts, fuses scores, returns
ranked results.

FIX #4: _row_to_record inlined here — the _helpers.py split was
unnecessary (no circular import risk) and added indirection for no gain.
"""

from __future__ import annotations

import time
from datetime import datetime

import numpy as np

from core.embed.clip_encoder import embed_text
from core.ingest.store import ImageStore
from core.utils.config import DEFAULT_TOP_K, FUSION_WEIGHTS, SEMANTIC_THRESHOLD
from core.utils.log import get_logger          # FIX: was logging.py
from core.utils.schemas import (
    ExpertScore,
    ExpertType,
    ImageRecord,
    ParsedQuery,
    QueryResult,
    RetrievalResult,
)

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Row → ImageRecord (was _helpers.py — now inlined)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Retriever
# ---------------------------------------------------------------------------

class Retriever:
    def __init__(self, store: ImageStore) -> None:
        self.store = store

    def search(self, parsed: ParsedQuery, top_k: int = DEFAULT_TOP_K) -> QueryResult:
        t0          = time.perf_counter()
        all_records = self.store.get_all()

        if not all_records:
            logger.warning("Store is empty — run ingest first")
            return QueryResult(query=parsed, results=[], latency_ms=0)

        scores: dict[str, dict[ExpertType, float]] = {r["id"]: {} for r in all_records}

        # Semantic expert
        if ExpertType.SEMANTIC in parsed.experts and parsed.semantic_text:
            for rid, score in self._semantic_scores(parsed.semantic_text, all_records).items():
                scores[rid][ExpertType.SEMANTIC] = score

        # Metadata expert
        if ExpertType.METADATA in parsed.experts and parsed.date_filter:
            for r in all_records:
                scores[r["id"]][ExpertType.METADATA] = self._metadata_score(r, parsed)

        # OCR expert
        if ExpertType.OCR in parsed.experts and parsed.ocr_keywords:
            for r in all_records:
                scores[r["id"]][ExpertType.OCR] = self._ocr_score(r, parsed.ocr_keywords)

        # Fusion
        results: list[RetrievalResult] = []
        for raw_record in all_records:
            rid          = raw_record["id"]
            expert_scores = scores[rid]
            if not expert_scores:
                continue

            active_weights = {
                e: FUSION_WEIGHTS[e.value]
                for e in expert_scores
                if e.value in FUSION_WEIGHTS
            }
            total_weight = sum(active_weights.values()) or 1.0
            final = sum(
                expert_scores[e] * w / total_weight
                for e, w in active_weights.items()
            )

            # Drop weak pure-semantic hits
            if list(expert_scores) == [ExpertType.SEMANTIC] and final < SEMANTIC_THRESHOLD:
                continue

            results.append(RetrievalResult(
                record=_row_to_record(raw_record),
                final_score=round(final, 4),
                expert_scores=[
                    ExpertScore(expert=e, score=round(s, 4))
                    for e, s in expert_scores.items()
                ],
            ))

        results.sort(key=lambda r: r.final_score, reverse=True)
        results = results[:top_k]

        latency_ms = (time.perf_counter() - t0) * 1000
        logger.info(
            f"Query '{parsed.raw}' → {len(results)} results "
            f"| experts={[e.value for e in parsed.experts]} "
            f"| {latency_ms:.1f}ms"
        )
        return QueryResult(query=parsed, results=results, latency_ms=latency_ms)

    # ------------------------------------------------------------------
    # Expert implementations
    # ------------------------------------------------------------------

    def _semantic_scores(self, text: str, records: list[dict]) -> dict[str, float]:
        query_emb = embed_text(text)
        out: dict[str, float] = {}
        for r in records:
            emb = r.get("embedding")
            if not emb:
                continue
            cosine = float(np.dot(query_emb, np.array(emb, dtype=np.float32)))
            out[r["id"]] = (cosine + 1) / 2    # map [-1,1] → [0,1]
        return out

    def _metadata_score(self, record: dict, parsed: ParsedQuery) -> float:
        if not parsed.date_filter:
            return 0.0
        df = parsed.date_filter
        try:
            created = record["created_at"]
            if isinstance(created, str):
                created = datetime.fromisoformat(created)
            elif hasattr(created, "to_pydatetime"):
                created = created.to_pydatetime()
            in_range = (
                (df.start is None or created >= df.start)
                and (df.end is None or created <= df.end)
            )
            return 1.0 if in_range else 0.0
        except Exception:
            return 0.0

    def _ocr_score(self, record: dict, keywords: list[str]) -> float:
        ocr_text = (record.get("ocr_text") or "").lower()
        if not ocr_text:
            return 0.0
        matches = sum(1 for kw in keywords if kw in ocr_text)
        return min(matches / max(len(keywords), 1), 1.0)