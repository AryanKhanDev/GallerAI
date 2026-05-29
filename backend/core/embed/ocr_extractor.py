"""
Chunk-aware OCR wrapper.
Returns OCR lines.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

from core.utils.config import (
    OCR_CONFIDENCE_MIN,
    OCR_ENABLED,
)
from core.utils.log import (
    get_logger,
)

logger = get_logger(__name__)

_ocr = None


def _load_ocr():

    global _ocr

    if _ocr is not None or not OCR_ENABLED:
        return

    from paddleocr import PaddleOCR

    logger.info(
        "Loading lightweight PaddleOCR..."
    )

    _ocr = PaddleOCR(
        lang="en",
        use_angle_cls=False,
        enable_mkldnn=False,
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_recognition_model_name="en_PP-OCRv5_mobile_rec",
    )

    logger.info(
        "PaddleOCR ready ✓"
    )


def extract_chunks(
    image: Image.Image,
) -> list[str]:

    if not OCR_ENABLED:
        return []

    _load_ocr()

    try:

        result = _ocr.ocr(
            np.array(image)
        )

        if not result:
            return []

        page = result[0]

        texts = page.get(
            "rec_texts",
            [],
        )

        scores = page.get(
            "rec_scores",
            [],
        )

        chunks = []

        for text, score in zip(
            texts,
            scores,
        ):
            if (
                score
                >= OCR_CONFIDENCE_MIN
            ):
                text = text.strip()

                if len(text) >= 2:
                    chunks.append(
                        text
                    )

        return chunks

    except Exception as e:
        logger.warning(
            f"OCR failed: {e}"
        )
        return []


def batch_extract(
    images,
):

    return [
        extract_chunks(img)
        for img in images
    ]