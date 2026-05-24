"""
core/retrieve/router.py
Rule-based query router. Determines which experts to invoke.
No LLM in v1 — fast, deterministic, fully testable.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional

from core.utils.schemas import DateFilter, ExpertType, ParsedQuery

# ---------------------------------------------------------------------------
# Reference tables
# ---------------------------------------------------------------------------

_WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}

_DOCUMENT_KEYWORDS = {
    "bill", "receipt", "invoice", "document", "doc", "pdf",
    "statement", "ticket", "tax", "form", "contract", "letter",
    "certificate", "report", "scan", "id", "passport", "card",
}

_DATE_RE = re.compile(
    r"\b(yesterday|today)\b"
    r"|last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
    r"|last\s+(week|month|year)"
    r"|\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b"
    r"|\b(january|february|march|april|may|june|july|august"
    r"|september|october|november|december)\b",
    re.IGNORECASE,
)

_STOP_WORDS = {"from", "last", "find", "show", "get", "me", "all", "the", "a", "an"}


# ---------------------------------------------------------------------------
# Date parsing
# ---------------------------------------------------------------------------

def _parse_date(query: str) -> Optional[DateFilter]:
    now = datetime.now()
    q   = query.lower()

    if "yesterday" in q:
        d = now - timedelta(days=1)
        return DateFilter(
            start=d.replace(hour=0, minute=0, second=0, microsecond=0),
            end=d.replace(hour=23, minute=59, second=59),
            label="yesterday",
        )

    if "today" in q:
        return DateFilter(
            start=now.replace(hour=0, minute=0, second=0, microsecond=0),
            end=now,
            label="today",
        )

    m = re.search(
        r"last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)", q
    )
    if m:
        target_day = _WEEKDAYS[m.group(1)]
        days_ago   = (now.weekday() - target_day) % 7 or 7
        d = now - timedelta(days=days_ago)
        return DateFilter(
            start=d.replace(hour=0, minute=0, second=0, microsecond=0),
            end=d.replace(hour=23, minute=59, second=59),
            label=f"last {m.group(1)}",
        )

    if re.search(r"last\s+week", q):
        start = now - timedelta(days=now.weekday() + 7)
        return DateFilter(start=start, end=start + timedelta(days=6), label="last week")

    if re.search(r"last\s+month", q):
        first = now.replace(day=1) - timedelta(days=1)
        return DateFilter(start=first.replace(day=1), end=first, label="last month")

    return None


def _has_document_intent(query: str) -> bool:
    return bool(set(query.lower().split()) & _DOCUMENT_KEYWORDS)


def _has_date_intent(query: str) -> bool:
    return bool(_DATE_RE.search(query))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_query(raw: str) -> ParsedQuery:
    """
    Analyse a natural language query and return a ParsedQuery.

    Examples
    --------
    "mountains"                     → [SEMANTIC]
    "last saturday"                 → [METADATA]
    "gas bill from last saturday"   → [METADATA, OCR, SEMANTIC]
    "shoes from last week"          → [METADATA, SEMANTIC]
    """
    experts:     list[ExpertType]  = []
    date_filter: Optional[DateFilter] = None
    ocr_keywords: list[str]        = []
    semantic_text: Optional[str]   = None

    q_lower = raw.lower().strip()

    # Metadata expert
    if _has_date_intent(raw):
        experts.append(ExpertType.METADATA)
        date_filter = _parse_date(raw)

    # OCR expert
    if _has_document_intent(raw):
        experts.append(ExpertType.OCR)
        ocr_keywords = [
            w for w in q_lower.split()
            if len(w) > 3 and w not in _STOP_WORDS
        ]

    # Semantic expert — active unless it's a bare date-only query
    # e.g. "last saturday" or "yesterday" → no semantic needed
    # but "shoes from last week" → has content words → semantic IS needed
    _DATE_TERMS  = {"yesterday", "today", "last", "week", "month", "year",
                    "monday", "tuesday", "wednesday", "thursday", "friday",
                    "saturday", "sunday"}
    content_words = [
        w for w in q_lower.split()
        if w not in _STOP_WORDS and w not in _DATE_TERMS and len(w) > 2
    ]
    pure_date = (
        ExpertType.METADATA in experts
        and not _has_document_intent(raw)
        and len(content_words) == 0
    )
    if not pure_date:
        experts.append(ExpertType.SEMANTIC)
        semantic_text = raw

    if not experts:
        experts       = [ExpertType.SEMANTIC]
        semantic_text = raw

    return ParsedQuery(
        raw=raw,
        experts=experts,
        semantic_text=semantic_text,
        date_filter=date_filter,
        ocr_keywords=ocr_keywords,
    )