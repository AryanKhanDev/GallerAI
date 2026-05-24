"""
core/embed/ocr_extractor.py
PaddleOCR wrapper. Extracts text from images for document retrieval.
Lazy-loads on first use.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.utils.config import OCR_CONFIDENCE_MIN, OCR_ENABLED
from core.utils.log import get_logger          # FIX: was logging.py

logger = get_logger(__name__)

_ocr = None


def _load_ocr() -> None:
    global _ocr
    if _ocr is not None or not OCR_ENABLED:
        return
    try:
        from paddleocr import PaddleOCR
        logger.info("Loading PaddleOCR…")
        _ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
        logger.info("PaddleOCR ready ✓")
    except ImportError:
        logger.warning(
            "PaddleOCR not installed — OCR disabled. "
            "Run: pip install paddlepaddle paddleocr"
        )


def extract_text(image_path: str | Path) -> Optional[str]:
    """Run OCR on one image. Returns extracted text or None."""
    if not OCR_ENABLED:
        return None
    _load_ocr()
    if _ocr is None:
        return None
    try:
        result = _ocr.ocr(str(image_path), cls=True)
        if not result or not result[0]:
            return None
        lines = [
            text
            for line in result[0]
            for text, confidence in [line[1]]
            if confidence >= OCR_CONFIDENCE_MIN
        ]
        extracted = " ".join(lines).strip()
        return extracted or None
    except Exception as e:
        logger.debug(f"OCR failed on {Path(image_path).name}: {e}")
        return None


def batch_extract(paths: list[str | Path]) -> list[Optional[str]]:
    return [extract_text(p) for p in paths]