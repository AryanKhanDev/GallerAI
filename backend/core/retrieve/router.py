"""
core/retrieve/router.py
Minimal router.

Router decides:
- semantic
- metadata

OCR is ALWAYS available and self-gated
inside retriever.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional

from core.utils.schemas import (
    DateFilter,
    ExpertType,
    ParsedQuery,
)

_WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
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

_STOP_WORDS = {
    "from",
    "last",
    "find",
    "show",
    "get",
    "me",
    "all",
    "the",
    "a",
    "an",
    "of",
    "for",
    "with",
    "to",
}

_DATE_TERMS = {
    "yesterday",
    "today",
    "last",
    "week",
    "month",
    "year",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
}


def _parse_date(
    query: str,
) -> Optional[DateFilter]:

    now = datetime.now()
    q = query.lower()

    if "yesterday" in q:
        d = now - timedelta(days=1)

        return DateFilter(
            start=d.replace(
                hour=0,
                minute=0,
                second=0,
                microsecond=0,
            ),
            end=d.replace(
                hour=23,
                minute=59,
                second=59,
            ),
            label="yesterday",
        )

    if "today" in q:
        return DateFilter(
            start=now.replace(
                hour=0,
                minute=0,
                second=0,
                microsecond=0,
            ),
            end=now,
            label="today",
        )

    m = re.search(
        r"last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
        q,
    )

    if m:

        target_day = _WEEKDAYS[
            m.group(1)
        ]

        days_ago = (
            (
                now.weekday()
                - target_day
            )
            % 7
            or 7
        )

        d = now - timedelta(
            days=days_ago
        )

        return DateFilter(
            start=d.replace(
                hour=0,
                minute=0,
                second=0,
                microsecond=0,
            ),
            end=d.replace(
                hour=23,
                minute=59,
                second=59,
            ),
            label=f"last {m.group(1)}",
        )

    if re.search(
        r"last\s+week",
        q,
    ):
        start = (
            now
            - timedelta(
                days=now.weekday() + 7
            )
        )

        return DateFilter(
            start=start,
            end=start + timedelta(days=6),
            label="last week",
        )

    if re.search(
        r"last\s+month",
        q,
    ):
        first = (
            now.replace(day=1)
            - timedelta(days=1)
        )

        return DateFilter(
            start=first.replace(day=1),
            end=first,
            label="last month",
        )

    return None


def _has_date_intent(
    query: str,
) -> bool:

    return bool(
        _DATE_RE.search(query)
    )


def _meaningful_words(
    query: str,
) -> list[str]:

    tokens = re.findall(
        r"\w+",
        query.lower(),
    )

    return [
        w
        for w in tokens
        if (
            len(w) > 2
            and w
            not in _STOP_WORDS
            and w
            not in _DATE_TERMS
        )
    ]


def parse_query(
    raw: str,
) -> ParsedQuery:

    experts = []

    semantic_text = raw
    date_filter = None

    words = _meaningful_words(
        raw
    )

    # metadata
    if _has_date_intent(
        raw
    ):
        experts.append(
            ExpertType.METADATA
        )

        date_filter = (
            _parse_date(raw)
        )

    # semantic always
    experts.append(
        ExpertType.SEMANTIC
    )

    return ParsedQuery(
        raw=raw,
        experts=experts,
        semantic_text=semantic_text,
        date_filter=date_filter,

        # OCR always available
        ocr_keywords=words,
    )