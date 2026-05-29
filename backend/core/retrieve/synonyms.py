"""
core/retrieve/synonyms.py

Two things live here:

1. Synonym map  — expand query keywords into aliases before lexical OCR matching.
2. Document patterns — classify OCR text into semantic document types,
   so "bill" matches a Walmart receipt even if the word "receipt" never appears.

Design:
- No external models, no runtime dependencies.
- Conservative synonym groups — only unambiguous aliases.
- Document patterns use regex + term sets, not ML.
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# 1. Synonym groups
#    Each set is a mutual-alias cluster.
#    If the user says any word in a group, we also search for the others.
# ---------------------------------------------------------------------------

_GROUPS: list[set[str]] = [

    # Financial documents (the big one)
    {"bill", "receipt", "invoice", "statement", "payment", "charge"},

    # Purchase records
    {"receipt", "purchase", "transaction", "order", "checkout"},

    # Tax / legal
    {"tax", "taxes", "refund", "filing", "return"},

    # Identity documents
    {"id", "identification", "passport", "license", "licence", "permit"},

    # Contracts / agreements
    {"contract", "agreement", "lease", "deed", "waiver"},

    # Medical
    {"prescription", "rx", "diagnosis", "report", "referral"},

    # Tickets
    {"ticket", "boarding", "pass", "reservation", "booking", "confirmation"},

    # Utility bills
    {"utility", "electric", "electricity", "gas", "water", "internet", "phone"},

    # Phone / contact
    {"phone", "mobile", "contact", "number", "tel", "fax"},

    # Codes / identifiers
    {"code", "barcode", "qr", "serial", "number", "reference", "ref"},

    # Delivery / shipping
    {"delivery", "shipping", "tracking", "package", "parcel", "courier"},

    # Insurance
    {"insurance", "policy", "claim", "coverage"},

    # Pet / animal
    {"dog", "cat", "pet", "animal", "puppy", "kitten"},

    # Food
    {"treat", "treats", "snack", "snacks", "food", "meal"},
]

_LOOKUP: dict[str, set[str]] = {}
for _group in _GROUPS:
    for _term in _group:
        if _term not in _LOOKUP:
            _LOOKUP[_term] = set()
        _LOOKUP[_term] |= _group


# ---------------------------------------------------------------------------
# 2. Document-type patterns
#    Maps a document category name → (regex patterns, term sets).
#    classify_ocr_text() returns which categories an OCR text belongs to.
# ---------------------------------------------------------------------------

# Price pattern: 2.49, 35.00, $12.99
_PRICE_RE = re.compile(r'\b\d+\.\d{2}\b')

# Quantity pattern: 1x, 2x, 3x
_QTY_RE = re.compile(r'\b\d+x\b', re.IGNORECASE)

_DOC_PATTERNS: dict[str, dict] = {
    "financial": {
        "terms": {
            "total", "subtotal", "tax", "receipt", "invoice",
            "amount", "price", "paid", "due", "balance",
            "qty", "item", "discount", "cash", "change",
            "payment", "charge", "bill", "statement",
        },
        "regex": [_PRICE_RE],        # prices like 2.49
        # Match if ANY regex fires OR 2+ terms match
        "min_terms": 2,
        "min_regex": 1,
    },
    "identity": {
        "terms": {
            "passport", "license", "licence", "permit", "id",
            "identification", "dob", "birth", "expires", "nationality",
            "surname", "given", "name",
        },
        "regex": [],
        "min_terms": 2,
        "min_regex": 0,
    },
    "medical": {
        "terms": {
            "prescription", "rx", "diagnosis", "dosage", "mg", "tablet",
            "patient", "doctor", "physician", "pharmacy", "refill",
        },
        "regex": [],
        "min_terms": 2,
        "min_regex": 0,
    },
    "shipping": {
        "terms": {
            "tracking", "shipment", "delivery", "courier", "package",
            "sender", "recipient", "weight", "kg", "lbs", "address",
        },
        "regex": [],
        "min_terms": 2,
        "min_regex": 0,
    },
}

# Map: query synonym group → document category it implies
_QUERY_TO_DOC_TYPE: dict[str, str] = {
    "bill":        "financial",
    "receipt":     "financial",
    "invoice":     "financial",
    "statement":   "financial",
    "payment":     "financial",
    "charge":      "financial",
    "passport":    "identity",
    "license":     "identity",
    "id":          "identity",
    "prescription":"medical",
    "rx":          "medical",
    "shipping":    "shipping",
    "tracking":    "shipping",
    "delivery":    "shipping",
}


def classify_ocr_text(ocr_text: str) -> set[str]:
    """
    Return set of document-type labels that match this OCR text.
    E.g. classify_ocr_text("...TOTAL 35.00 TAX...") → {"financial"}
    """
    tokens = set(re.findall(r"\w+", ocr_text.lower()))
    matched: set[str] = set()

    for doc_type, spec in _DOC_PATTERNS.items():
        term_hits  = len(tokens & spec["terms"])
        regex_hits = sum(1 for rx in spec["regex"] if rx.search(ocr_text))

        if regex_hits >= spec["min_regex"] > 0 or term_hits >= spec["min_terms"]:
            matched.add(doc_type)

    return matched


def query_doc_types(keywords: list[str]) -> set[str]:
    """
    Return document types implied by the query keywords.
    E.g. query_doc_types(["bill"]) → {"financial"}
    """
    types: set[str] = set()
    for kw in keywords:
        if kw in _QUERY_TO_DOC_TYPE:
            types.add(_QUERY_TO_DOC_TYPE[kw])
    return types


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def expand_keywords(keywords: list[str]) -> list[str]:
    """
    Expand query keywords with synonyms for OCR lexical matching.

    Example:
        expand_keywords(["bill"])
        → ["bill", "receipt", "invoice", "statement", "payment", "charge"]
    """
    expanded: set[str] = set()
    for kw in keywords:
        expanded.add(kw)
        if kw in _LOOKUP:
            expanded |= _LOOKUP[kw]

    result = list(keywords)
    for term in expanded:
        if term not in keywords:
            result.append(term)
    return result