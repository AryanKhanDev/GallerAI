"""
tests/test_synonyms.py
Unit tests for synonym expansion. Zero model dependencies.

Run:
    pytest tests/test_synonyms.py -v
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.retrieve.synonyms import expand_keywords


def test_bill_expands_to_receipt():
    expanded = expand_keywords(["bill"])
    assert "receipt" in expanded
    assert "invoice" in expanded
    assert "statement" in expanded

def test_receipt_expands():
    expanded = expand_keywords(["receipt"])
    assert "bill" in expanded
    assert "invoice" in expanded

def test_invoice_expands():
    expanded = expand_keywords(["invoice"])
    assert "receipt" in expanded
    assert "bill" in expanded

def test_dog_treat_expands():
    expanded = expand_keywords(["dog", "treat"])
    # dog group
    assert "pet" in expanded
    # treat group
    assert "treats" in expanded or "snack" in expanded

def test_shoes_no_expansion():
    # shoes has no synonym group — should just return itself
    expanded = expand_keywords(["shoes"])
    assert "shoes" in expanded
    # must NOT expand into document/receipt territory
    assert "receipt" not in expanded
    assert "invoice" not in expanded

def test_originals_preserved():
    expanded = expand_keywords(["bill"])
    assert "bill" in expanded   # original always present

def test_phone_number_expands():
    expanded = expand_keywords(["phone", "number"])
    assert "mobile" in expanded
    assert "contact" in expanded

def test_empty_input():
    assert expand_keywords([]) == []

def test_no_duplicates():
    expanded = expand_keywords(["receipt", "bill"])
    assert len(expanded) == len(set(expanded))