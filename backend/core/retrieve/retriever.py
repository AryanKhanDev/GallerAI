"""
core/retrieve/retriever.py
Hybrid retrieval engine.

Semantic image retrieval
+
Always-available self-gated OCR with three layers:
  1. Lexical evidence      — exact/stem token overlap (synonym-expanded)
  2. Document-type match   — "bill" matches any financial-looking OCR text
  3. Dense semantic assist — gated at high confidence threshold

OCR contributes only when at least one layer fires.
"""

from __future__ import annotations

import re
import time
from datetime import datetime, timezone

import numpy as np

from core.embed.clip_encoder import embed_text
from core.ingest.store import ImageStore
from core.retrieve.synonyms import (
    classify_ocr_text,
    expand_keywords,
    query_doc_types,
)
from core.utils.config import (
    DEFAULT_TOP_K,
    FUSION_WEIGHTS,
    SEMANTIC_THRESHOLD,
)
from core.utils.log import get_logger
from core.utils.schemas import (
    ExpertScore,
    ExpertType,
    ImageRecord,
    ParsedQuery,
    QueryResult,
    RetrievalResult,
)

logger = get_logger(__name__)

OCR_LEXICAL_WEIGHT  = 0.60
OCR_DOCTYPE_WEIGHT  = 0.25
OCR_DENSE_WEIGHT    = 0.15
OCR_DENSE_GATE      = 0.82   # dense only contributes if very confident


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"\w+", text.lower()))


def _dt(v):
    if isinstance(v, datetime):
        return v
    if isinstance(v, str):
        return datetime.fromisoformat(v)
    if hasattr(v, "to_pydatetime"):
        return v.to_pydatetime()
    return datetime.utcnow()


def _safe_list(v):
    if v is None:
        return []
    if hasattr(v, "tolist"):
        return v.tolist()
    return list(v)


def _clean_text(v):
    if v is None:
        return None
    try:
        if np.isnan(v):
            return None
    except Exception:
        pass
    s = str(v).strip()
    if not s or s.lower() == "nan":
        return None
    return s


def _row_to_record(row: dict) -> ImageRecord:
    return ImageRecord(
        id=row["id"],
        path=row["path"],
        filename=row["filename"],
        created_at=_dt(row["created_at"]),
        modified_at=_dt(row["modified_at"]),
        file_size_bytes=int(row["file_size_bytes"]),
        width=row.get("width"),
        height=row.get("height"),
        embedding=_safe_list(row.get("embedding")),
        ocr_text=_clean_text(row.get("ocr_text")),
        ocr_embedding=_safe_list(row.get("ocr_embedding")),
        ocr_chunks=_safe_list(row.get("ocr_chunks")),
        ocr_chunk_embeddings=_safe_list(row.get("ocr_chunk_embeddings")),
        tags=_safe_list(row.get("tags")),
        indexed_at=_dt(row.get("indexed_at", datetime.now(timezone.utc))),
    )


# ---------------------------------------------------------------------------
# Retriever
# ---------------------------------------------------------------------------

class Retriever:

    def __init__(self, store: ImageStore) -> None:
        self.store = store

    def search(self, parsed: ParsedQuery, top_k: int = DEFAULT_TOP_K) -> QueryResult:
        t0 = time.perf_counter()
        all_records = self.store.get_all()

        if not all_records:
            logger.warning("Store empty — run ingest")
            return QueryResult(query=parsed, results=[], latency_ms=0)

        scores: dict[str, dict[ExpertType, float]] = {r["id"]: {} for r in all_records}

        # Semantic
        if ExpertType.SEMANTIC in parsed.experts and parsed.semantic_text:
            for rid, score in self._semantic_scores(parsed.semantic_text, all_records).items():
                scores[rid][ExpertType.SEMANTIC] = score

        # Metadata
        if ExpertType.METADATA in parsed.experts and parsed.date_filter:
            for r in all_records:
                scores[r["id"]][ExpertType.METADATA] = self._metadata_score(r, parsed)

        # OCR — always attempted, self-gated inside _ocr_score
        if parsed.ocr_keywords:
            for r in all_records:
                ocr = self._ocr_score(r, parsed.ocr_keywords)
                if ocr > 0:
                    scores[r["id"]][ExpertType.OCR] = ocr

        # Fusion
        results: list[RetrievalResult] = []

        for raw_record in all_records:
            rid = raw_record["id"]
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

            # Drop weak pure-semantic hits below threshold
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

        latency_ms = (time.perf_counter() - t0) * 1000
        logger.info(
            f"Query '{parsed.raw}' -> {len(results)} results "
            f"| experts={[e.value for e in parsed.experts]} "
            f"| {latency_ms:.1f}ms"
        )
        return QueryResult(query=parsed, results=results[:top_k], latency_ms=latency_ms)

    # -------------------------------------------------------------------------
    # Expert implementations
    # -------------------------------------------------------------------------

    def _semantic_scores(self, text: str, records: list[dict]) -> dict[str, float]:
        query_emb = embed_text(text)
        out: dict[str, float] = {}
        for r in records:
            emb = r.get("embedding")
            if emb is None or len(emb) == 0:
                continue
            cosine = float(np.dot(query_emb, np.array(emb, dtype=np.float32)))
            out[r["id"]] = (cosine + 1) / 2
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
            return 1.0 if (
                (df.start is None or created >= df.start)
                and (df.end is None or created <= df.end)
            ) else 0.0
        except Exception:
            return 0.0

    def _ocr_score(self, record: dict, keywords: list[str]) -> float:
        """
        Three-layer OCR scoring:

        Layer 1 — Lexical evidence (synonym-expanded, stem-tolerant)
            "bill" expands to receipt/invoice/statement → token match in OCR text
            Original keyword match: full weight
            Synonym-expansion match: half weight

        Layer 2 — Document-type match
            "bill" implies doc_type=financial
            If OCR text looks like a financial document (prices, totals, etc.)
            → score = 1.0 regardless of exact token overlap
            Solves: "bill" matching Walmart receipt that never says "bill"

        Layer 3 — Dense semantic assist (gated)
            CLIP text similarity, only fires above OCR_DENSE_GATE=0.82
            Safety valve for novel queries not covered by layers 1+2

        Self-gate: if all three layers produce 0 → return 0
        Prevents non-text images from ever contributing OCR noise.
        """
        if not keywords:
            return 0.0

        ocr_text = _clean_text(record.get("ocr_text")) or ""
        ocr_emb  = record.get("ocr_embedding")

        if not ocr_text:
            return 0.0

        # ── Layer 1: Lexical (synonym-expanded, stem-tolerant) ─────────────
        expanded       = expand_keywords(keywords)
        query_stems    = {t.rstrip("s") for t in expanded}
        ocr_stems      = {t.rstrip("s") for t in _tokenize(ocr_text)}
        original_stems = {t.rstrip("s") for t in keywords}

        original_matched = original_stems & ocr_stems
        expanded_matched = (query_stems & ocr_stems) - original_matched

        lexical = min(
            (len(original_matched) + 0.5 * len(expanded_matched))
            / max(len(original_stems), 1),
            1.0,
        )

        # ── Layer 2: Document-type match ───────────────────────────────────
        # Does the query imply a document type AND does the OCR look like that?
        q_doc_types  = query_doc_types(keywords)
        ocr_doc_types = classify_ocr_text(ocr_text)
        doc_type_score = 1.0 if (q_doc_types & ocr_doc_types) else 0.0

        # ── Layer 3: Dense semantic assist (gated) ─────────────────────────
        dense = 0.0
        if ocr_emb is not None and len(ocr_emb) > 0:
            q_emb = embed_text(" ".join(keywords))
            dense = (float(np.dot(q_emb, np.array(ocr_emb, dtype=np.float32))) + 1) / 2

        # ── Self-gate ──────────────────────────────────────────────────────
        # Must have at least one layer firing
        if lexical == 0 and doc_type_score == 0 and dense < OCR_DENSE_GATE:
            return 0.0

        score = (
            OCR_LEXICAL_WEIGHT  * lexical
            + OCR_DOCTYPE_WEIGHT  * doc_type_score
            + OCR_DENSE_WEIGHT    * (dense if dense >= OCR_DENSE_GATE else 0.0)
        )
        return float(min(score, 1.0))