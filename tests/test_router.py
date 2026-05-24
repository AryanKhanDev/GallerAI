"""
tests/test_router.py                 ← FIX #1: was Test_router.py (capital T)
Unit tests for the query router. Zero model dependencies — pure logic.

Run from repo root:
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
    assert ExpertType.OCR not in q.experts


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
# OCR / documents
# ---------------------------------------------------------------------------

def test_ocr_gas_bill():
    q = parse_query("gas bill")
    assert ExpertType.OCR in q.experts
    assert ExpertType.SEMANTIC in q.experts


def test_ocr_receipt():
    q = parse_query("find that supermarket receipt")
    assert ExpertType.OCR in q.experts


# ---------------------------------------------------------------------------
# Mixed queries
# ---------------------------------------------------------------------------

def test_mixed_bill_date():
    q = parse_query("gas bill from last saturday")
    assert ExpertType.METADATA in q.experts
    assert ExpertType.OCR in q.experts
    assert q.date_filter is not None


def test_mixed_shoes_date():
    q = parse_query("shoes from last week")
    assert ExpertType.METADATA in q.experts
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