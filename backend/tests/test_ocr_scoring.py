"""
tests/test_ocr_scoring.py
Tests for OCR classification and scoring logic.
Zero model dependencies — no CLIP, no PaddleOCR.

Covers:
  - classify_ocr_text()   : document type detection from OCR text
  - query_doc_types()     : query → implied document types
  - OCR score layers 1+2  : lexical + doc-type scoring (dense skipped, needs CLIP)
  - Self-gate             : non-text queries must not fire OCR on text images

Run:
    pytest tests/test_ocr_scoring.py -v
"""

import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.retrieve.synonyms import (
    classify_ocr_text,
    expand_keywords,
    query_doc_types,
)


# ---------------------------------------------------------------------------
# Helpers — simulate OCR layers 1+2 without CLIP
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"\w+", text.lower()))


def _ocr_layers_12(keywords: list[str], ocr_text: str) -> tuple[float, float, bool]:
    """
    Returns (lexical_score, doc_type_score, is_gated).
    is_gated=True means OCR would return 0 (no evidence).
    Mirrors retriever._ocr_score layers 1+2 exactly.
    """
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

    q_dt  = query_doc_types(keywords)
    o_dt  = classify_ocr_text(ocr_text)
    doc_type = 1.0 if (q_dt & o_dt) else 0.0

    is_gated = (lexical == 0 and doc_type == 0)
    return round(lexical, 4), round(doc_type, 4), is_gated


# ---------------------------------------------------------------------------
# classify_ocr_text
# ---------------------------------------------------------------------------

class TestClassifyOcrText:

    def test_financial_via_price_pattern(self):
        # Price regex alone is enough
        assert "financial" in classify_ocr_text("Item 1x 35.00")

    def test_financial_via_terms(self):
        assert "financial" in classify_ocr_text("SUBTOTAL TAX TOTAL")

    def test_financial_walmart_receipt(self):
        ocr = "Walmart Save money MANAGER DOG TREATS Pedigree 2.49 SUBTOTAL TAX TOTAL"
        assert "financial" in classify_ocr_text(ocr)

    def test_financial_lorem_receipt(self):
        ocr = "RECEIPT 1x Lorem ipsum 35.00 2x Lorem ipsum 15.00 Total 100.00"
        assert "financial" in classify_ocr_text(ocr)

    def test_financial_invoice(self):
        ocr = "invoice number 1234 amount due 50.00 payment"
        assert "financial" in classify_ocr_text(ocr)

    def test_identity_passport(self):
        ocr = "passport expires dob nationality surname given"
        assert "identity" in classify_ocr_text(ocr)

    def test_identity_license(self):
        ocr = "license identification expires dob surname"
        assert "identity" in classify_ocr_text(ocr)

    def test_shipping_tracking(self):
        ocr = "tracking shipment courier package sender address"
        assert "shipping" in classify_ocr_text(ocr)

    def test_medical_prescription(self):
        ocr = "prescription rx dosage mg tablet patient doctor"
        assert "medical" in classify_ocr_text(ocr)

    def test_plain_photo_no_match(self):
        # Natural scene descriptions should not classify as documents
        assert classify_ocr_text("just a photo of a dog in the park") == set()

    def test_shoe_label_no_match(self):
        assert classify_ocr_text("Nike Air Max running shoe sneaker") == set()

    def test_empty_string(self):
        assert classify_ocr_text("") == set()

    def test_single_financial_term_not_enough(self):
        # Only 1 term, no price — must NOT classify as financial
        assert "financial" not in classify_ocr_text("total")

    def test_two_financial_terms_enough(self):
        assert "financial" in classify_ocr_text("total tax")


# ---------------------------------------------------------------------------
# query_doc_types
# ---------------------------------------------------------------------------

class TestQueryDocTypes:

    def test_bill_is_financial(self):
        assert query_doc_types(["bill"]) == {"financial"}

    def test_receipt_is_financial(self):
        assert query_doc_types(["receipt"]) == {"financial"}

    def test_invoice_is_financial(self):
        assert query_doc_types(["invoice"]) == {"financial"}

    def test_statement_is_financial(self):
        assert query_doc_types(["statement"]) == {"financial"}

    def test_passport_is_identity(self):
        assert query_doc_types(["passport"]) == {"identity"}

    def test_tracking_is_shipping(self):
        assert query_doc_types(["tracking"]) == {"shipping"}

    def test_prescription_is_medical(self):
        assert query_doc_types(["prescription"]) == {"medical"}

    def test_shoes_no_doc_type(self):
        assert query_doc_types(["shoes"]) == set()

    def test_mountains_no_doc_type(self):
        assert query_doc_types(["mountains"]) == set()

    def test_dog_treat_no_doc_type(self):
        assert query_doc_types(["dog", "treat"]) == set()

    def test_empty_keywords(self):
        assert query_doc_types([]) == set()

    def test_mixed_financial_and_unknown(self):
        result = query_doc_types(["bill", "mountains"])
        assert "financial" in result


# ---------------------------------------------------------------------------
# OCR score layers 1+2 (no CLIP required)
# ---------------------------------------------------------------------------

class TestOcrScoreLayers:

    # --- bill queries ---

    def test_bill_fires_on_lorem_receipt(self):
        lex, doc, gated = _ocr_layers_12(["bill"], "RECEIPT Lorem ipsum 35.00 TOTAL")
        assert not gated
        assert doc == 1.0          # doc-type match carries it

    def test_bill_fires_on_walmart_receipt(self):
        # Walmart OCR never says "bill" or "receipt" explicitly
        lex, doc, gated = _ocr_layers_12(
            ["bill"], "Walmart MANAGER DOG TREATS Pedigree 2.49 SUBTOTAL TAX TOTAL"
        )
        assert not gated
        assert doc == 1.0

    def test_bill_gated_on_plain_photo(self):
        lex, doc, gated = _ocr_layers_12(["bill"], "sunset over the mountains")
        assert gated

    # --- shoes should never fire on receipt ---

    def test_shoes_gated_on_walmart_receipt(self):
        lex, doc, gated = _ocr_layers_12(
            ["shoes"], "Walmart SUBTOTAL 2.49 TAX TOTAL"
        )
        assert gated

    def test_shoes_gated_on_lorem_receipt(self):
        lex, doc, gated = _ocr_layers_12(
            ["shoes"], "RECEIPT Lorem ipsum 35.00 TOTAL"
        )
        assert gated

    def test_shoes_fires_on_shoe_label(self):
        # If an image literally has "shoe" text, OCR should help
        lex, doc, gated = _ocr_layers_12(["shoes"], "Nike running shoe sneaker size 10")
        assert not gated
        assert lex > 0

    # --- dog treat ---

    def test_dog_treat_fires_on_walmart_receipt(self):
        lex, doc, gated = _ocr_layers_12(
            ["dog", "treat"], "DOG TREATS Pedigree 2.49 SUBTOTAL TAX TOTAL"
        )
        assert not gated
        assert lex > 0

    def test_dog_treat_gated_on_lorem_receipt(self):
        # Generic receipt with no dog/treat text
        lex, doc, gated = _ocr_layers_12(
            ["dog", "treat"], "RECEIPT Lorem ipsum 35.00 Total 100.00"
        )
        assert gated

    # --- mountains should never fire on anything financial ---

    def test_mountains_gated_on_receipt(self):
        lex, doc, gated = _ocr_layers_12(
            ["mountains"], "RECEIPT Lorem ipsum 35.00 TOTAL"
        )
        assert gated

    def test_mountains_gated_on_walmart(self):
        lex, doc, gated = _ocr_layers_12(
            ["mountains"], "Walmart SUBTOTAL TAX TOTAL"
        )
        assert gated

    # --- receipt query ---

    def test_receipt_fires_on_receipt_ocr(self):
        lex, doc, gated = _ocr_layers_12(
            ["receipt"], "RECEIPT 1x Lorem ipsum 35.00 Total"
        )
        assert not gated
        assert lex > 0   # literal match
        assert doc == 1.0

    # --- invoice ---

    def test_invoice_fires_on_invoice_doc(self):
        lex, doc, gated = _ocr_layers_12(
            ["invoice"], "invoice number 1234 amount due 50.00"
        )
        assert not gated
        assert lex > 0

    # --- gas bill ---

    def test_gas_bill_fires_on_utility_doc(self):
        lex, doc, gated = _ocr_layers_12(
            ["gas", "bill"], "gas utility bill payment due 45.00"
        )
        assert not gated
        assert lex > 0
        assert doc == 1.0

    # --- score values ---

    def test_exact_match_gives_max_lexical(self):
        lex, doc, gated = _ocr_layers_12(["receipt"], "RECEIPT total 35.00 TAX")
        assert lex == 1.0

    def test_expansion_match_gives_half_weight(self):
        # "bill" doesn't appear in OCR, but "receipt" does (via expansion)
        lex, doc, gated = _ocr_layers_12(["bill"], "RECEIPT total 35.00")
        assert lex == 0.5    # expansion hit = half weight

    def test_no_text_image_always_gated(self):
        # Images without OCR text: the retriever returns 0 before scoring
        # Simulate empty OCR text
        lex, doc, gated = _ocr_layers_12(["bill"], "")
        # Empty text → no tokens → no matches
        assert gated


# ---------------------------------------------------------------------------
# Fusion weight sanity
# ---------------------------------------------------------------------------

class TestFusionWeights:

    def test_weights_sum_to_one(self):
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from core.utils.config import FUSION_WEIGHTS
        total = sum(FUSION_WEIGHTS.values())
        assert abs(total - 1.0) < 1e-6, f"Weights sum to {total}, expected 1.0"

    def test_ocr_outweighs_semantic(self):
        from core.utils.config import FUSION_WEIGHTS
        assert FUSION_WEIGHTS["ocr"] > FUSION_WEIGHTS["semantic"]

    def test_all_expected_keys_present(self):
        from core.utils.config import FUSION_WEIGHTS
        assert "semantic" in FUSION_WEIGHTS
        assert "ocr" in FUSION_WEIGHTS
        assert "metadata" in FUSION_WEIGHTS