"""
core/embed/clip_encoder.py
OpenCLIP wrapper.
GPU-aware + supports preloaded PIL images.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import open_clip
import torch
from PIL import Image

from core.utils.config import (
    BATCH_SIZE,
    CLIP_EMBED_DIM,
    CLIP_MODEL_NAME,
    CLIP_PRETRAINED,
)
from core.utils.log import get_logger

logger = get_logger(__name__)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_model = None
_preprocess = None
_tokenizer = None


def _load_model() -> None:
    global _model, _preprocess, _tokenizer

    if _model is not None:
        return

    logger.info(
        f"Loading CLIP {CLIP_MODEL_NAME} "
        f"({CLIP_PRETRAINED}) on {DEVICE}…"
    )

    _model, _, _preprocess = (
        open_clip.create_model_and_transforms(
            CLIP_MODEL_NAME,
            pretrained=CLIP_PRETRAINED,
        )
    )

    _model = _model.to(DEVICE)
    _model.eval()

    _tokenizer = open_clip.get_tokenizer(
        CLIP_MODEL_NAME
    )

    logger.info(
        f"CLIP ready on {DEVICE} ✓"
    )


def embed_images(
    images: list[Image.Image],
) -> np.ndarray:

    _load_model()

    all_embeddings = []

    for i in range(
        0,
        len(images),
        BATCH_SIZE,
    ):

        batch = images[
            i : i + BATCH_SIZE
        ]

        tensors = []

        for img in batch:
            try:
                tensors.append(
                    _preprocess(img)
                )
            except Exception as e:
                logger.warning(
                    f"CLIP preprocess failed: {e}"
                )

        if not tensors:
            continue

        tensor = (
            torch.stack(tensors)
            .to(DEVICE)
        )

        with torch.no_grad():
            feats = (
                _model.encode_image(
                    tensor
                )
            )

            feats = feats / feats.norm(
                dim=-1,
                keepdim=True,
            )

        all_embeddings.append(
            feats.detach()
            .cpu()
            .numpy()
            .astype(np.float32)
        )

    if not all_embeddings:
        return np.zeros(
            (0, CLIP_EMBED_DIM),
            dtype=np.float32,
        )

    return np.concatenate(
        all_embeddings,
        axis=0,
    )


def embed_text(text: str):
    _load_model()

    tokens = (
        _tokenizer([text])
        .to(DEVICE)
    )

    with torch.no_grad():
        feats = (
            _model.encode_text(
                tokens
            )
        )

        feats = feats / feats.norm(
            dim=-1,
            keepdim=True,
        )

    return (
        feats.detach()
        .cpu()
        .numpy()[0]
        .astype(np.float32)
    )