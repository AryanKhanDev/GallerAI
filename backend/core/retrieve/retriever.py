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

OCR_LEXICAL_WEIGHT  = 0.52
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

    def search(
        self,
        parsed: ParsedQuery,
        top_k: int = DEFAULT_TOP_K,
        mode: str = "gallery",
    ) -> QueryResult:
        t0 = time.perf_counter()
        all_records = self.store.get_all()

        if not all_records:
            logger.warning("Store empty — run ingest")
            return QueryResult(
                query=parsed,
                results=[],
                latency_ms=0,
            )

        scores: dict[str, dict[ExpertType, float]] = {
            r["id"]: {}
            for r in all_records
        }

        # ── Semantic ──────────────────────────────────────────────────────────
        if (
            ExpertType.SEMANTIC in parsed.experts
            and parsed.semantic_text
        ):
            for rid, score in self._semantic_scores(
                parsed.semantic_text,
                all_records,
            ).items():
                scores[rid][
                    ExpertType.SEMANTIC
                ] = score

        # ── Metadata ──────────────────────────────────────────────────────────
        if (
            ExpertType.METADATA in parsed.experts
            and parsed.date_filter
        ):
            for r in all_records:
                scores[r["id"]][
                    ExpertType.METADATA
                ] = self._metadata_score(
                    r,
                    parsed,
                )

        # ── OCR ───────────────────────────────────────────────────────────────
        if parsed.ocr_keywords:
            for r in all_records:
                ocr = self._ocr_score(
                    r,
                    parsed.ocr_keywords,
                )
                if ocr > 0:
                    scores[r["id"]][
                        ExpertType.OCR
                    ] = ocr

        # ── Fusion ────────────────────────────────────────────────────────────
        results: list[
            RetrievalResult
        ] = []

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

            total_weight = (
                sum(
                    active_weights.values()
                )
                or 1.0
            )

            final = sum(
                expert_scores[e]
                * w
                / total_weight
                for e, w in active_weights.items()
            )

            # Drop weak pure semantic hits
            if (
                list(expert_scores)
                == [ExpertType.SEMANTIC]
                and final
                < SEMANTIC_THRESHOLD
            ):
                continue

            results.append(
                RetrievalResult(
                    record=_row_to_record(
                        raw_record
                    ),
                    final_score=round(
                        final,
                        4,
                    ),
                    expert_scores=[
                        ExpertScore(
                            expert=e,
                            score=round(
                                s,
                                4,
                            ),
                        )
                        for e, s in expert_scores.items()
                    ],
                )
            )

        # ── Rank ──────────────────────────────────────────────────────────────
        results.sort(
            key=lambda r: r.final_score,
            reverse=True,
        )

       # ── CHAT MODE Hybrid + Intent-Aware Gap ──────────────────────────────
        if mode == "chat" and results:
            REL_ALPHA = 0.90
            ABS_MIN = 0.60
            GAP_THRESHOLD = 0.015

            best_score = (
                results[0]
                .final_score
            )

            logger.info(
                "CHAT RAW SCORES: "
                + str([
                    round(
                        r.final_score,
                        3
                    )
                    for r in results[:10]
                ])
            )

            # Detect document-style query
            is_doc_query = bool(
                query_doc_types(
                    parsed.ocr_keywords
                )
            )

            # Object queries:
            # strict relative confidence
            if not is_doc_query:
                relative_cutoff = (
                    best_score
                    * REL_ALPHA
                )

                hybrid_cutoff = max(
                    relative_cutoff,
                    ABS_MIN,
                )

            # Document queries:
            # softer relative confidence
            else:
                DOC_REL_ALPHA = 0.78

                relative_cutoff = (
                    best_score
                    * DOC_REL_ALPHA
                )

                hybrid_cutoff = max(
                    relative_cutoff,
                    ABS_MIN,
                )
            # First-pass hybrid filter
            filtered = [
                r
                for r in results
                if r.final_score
                >= hybrid_cutoff
            ]

            # Detect document-style query
            is_doc_query = bool(
                query_doc_types(
                    parsed.ocr_keywords
                )
            )

            # Object queries:
            # use elbow/gap pruning
            if (
                not is_doc_query
                and len(filtered) > 1
            ):
                keep_until = len(
                    filtered
                )

                for i in range(
                    len(filtered) - 1
                ):
                    gap = (
                        filtered[i]
                        .final_score
                        - filtered[
                            i + 1
                        ].final_score
                    )

                    if (
                        gap
                        >= GAP_THRESHOLD
                    ):
                        keep_until = (
                            i + 1
                        )
                        break

                results = filtered[
                    :keep_until
                ]

            # Document queries:
            # keep all hybrid-passing docs
            else:
                results = filtered

            logger.info(
                f"Chat cutoff "
                f"{hybrid_cutoff:.3f} "
                f"(best={best_score:.3f}, "
                f"rel={relative_cutoff:.3f}, "
                f"doc={is_doc_query}) "
                f"→ {len(results)} kept"
            )
        latency_ms = (
            time.perf_counter()
            - t0
        ) * 1000

        logger.info(
            f"Query '{parsed.raw}' "
            f"mode={mode} "
            f"-> {len(results)} results "
            f"| experts={[e.value for e in parsed.experts]} "
            f"| {latency_ms:.1f}ms"
        )

        return QueryResult(
            query=parsed,
            results=results[:top_k],
            latency_ms=latency_ms,
        )

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
        Layer 2 — Document-type match
        Layer 3 — Dense semantic assist (boost-only, see note below)

        Self-gate: only lexical or doc-type evidence can establish that
        OCR is relevant to this query. Dense CLIP text-vs-text similarity
        is NOT used as a standalone trigger — short/garbled OCR strings
        routinely score 0.6-0.9+ cosine similarity against completely
        unrelated query text due to CLIP's text-embedding anisotropy.
        Letting dense open the gate on its own caused OCR to fire (and
        drag down fusion via its 0.55 weight) for images whose OCR text
        had nothing to do with the query. Dense now only ever boosts an
        already-established lexical/doc-type match.
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
        q_doc_types   = query_doc_types(keywords)
        ocr_doc_types = classify_ocr_text(ocr_text)
        doc_type_score = 1.0 if (q_doc_types & ocr_doc_types) else 0.0

        # ── Self-gate ─────────────────────────────────────────────────────
        # Dense is boost-only — it cannot fire OCR scoring on its own.
        if lexical == 0 and doc_type_score == 0:
            return 0.0

        # ── Layer 3: Dense semantic assist (only computed once gated in) ──
        dense = 0.0
        if ocr_emb is not None and len(ocr_emb) > 0:
            q_emb = embed_text(" ".join(keywords))
            dense = (float(np.dot(q_emb, np.array(ocr_emb, dtype=np.float32))) + 1) / 2

        score = (
            OCR_LEXICAL_WEIGHT  * lexical
            + OCR_DOCTYPE_WEIGHT  * doc_type_score
            + OCR_DENSE_WEIGHT    * (dense if dense >= OCR_DENSE_GATE else 0.0)
        )
        return float(min(score, 1.0))