"""
tests/test_router.py
Unit tests for the query router.

Architecture note:
  OCR is NO LONGER declared in router experts.
  OCR is always-available, self-gated inside the retriever.
  Router only decides: SEMANTIC and METADATA.
  OCR keywords are still passed via ocr_keywords field.

Run:
    pytest tests/test_router.py -v
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.retrieve.router import parse_query
from core.utils.schemas import ExpertType


# ---------------------------------------------------------------------------
# Semantic
# ---------------------------------------------------------------------------

def test_pure_semantic():
    q = parse_query("mountains")
    assert ExpertType.SEMANTIC in q.experts
    assert ExpertType.METADATA not in q.experts

def test_semantic_shoes():
    q = parse_query("shoes")
    assert ExpertType.SEMANTIC in q.experts

def test_semantic_text_propagated():
    q = parse_query("sunset at the beach")
    assert q.semantic_text == "sunset at the beach"


# ---------------------------------------------------------------------------
# Metadata / date
# ---------------------------------------------------------------------------

def test_metadata_yesterday():
    q = parse_query("get me all images from yesterday")
    assert ExpertType.METADATA in q.experts
    assert q.date_filter is not None
    assert q.date_filter.label == "yesterday"

def test_metadata_last_saturday():
    q = parse_query("photos from last saturday")
    assert ExpertType.METADATA in q.experts
    assert q.date_filter is not None
    assert "saturday" in q.date_filter.label

def test_metadata_last_week():
    q = parse_query("pictures from last week")
    assert ExpertType.METADATA in q.experts
    assert q.date_filter is not None
    assert q.date_filter.label == "last week"


# ---------------------------------------------------------------------------
# OCR keywords — router populates ocr_keywords even though OCR expert
# is not in experts list (retriever self-gates OCR)
# ---------------------------------------------------------------------------

def test_ocr_gas_bill_keywords_populated():
    q = parse_query("gas bill")
    assert "gas" in q.ocr_keywords or "bill" in q.ocr_keywords

def test_ocr_receipt_keywords_populated():
    q = parse_query("find that supermarket receipt")
    assert "receipt" in q.ocr_keywords or "supermarket" in q.ocr_keywords

def test_ocr_always_has_keywords_for_content_queries():
    # Any non-trivial query should carry ocr_keywords for self-gated OCR
    q = parse_query("gas bill from last saturday")
    assert ExpertType.METADATA in q.experts
    assert ExpertType.SEMANTIC in q.experts
    assert len(q.ocr_keywords) > 0   # keywords available for retriever


# ---------------------------------------------------------------------------
# Mixed queries
# ---------------------------------------------------------------------------

def test_mixed_shoes_date():
    q = parse_query("shoes from last week")
    assert ExpertType.METADATA in q.experts
    assert ExpertType.SEMANTIC in q.experts

def test_semantic_always_present_for_content():
    q = parse_query("gas bill from last saturday")
    assert ExpertType.SEMANTIC in q.experts


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

def test_short_fallback():
    q = parse_query("hi")
    assert ExpertType.SEMANTIC in q.experts

def test_empty_string_fallback():
    q = parse_query("")
    assert ExpertType.SEMANTIC in q.experts