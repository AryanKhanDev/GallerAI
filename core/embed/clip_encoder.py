"""
core/embed/clip_encoder.py
Wraps OpenCLIP. Produces 512-d embeddings for images and text queries.
Batched. Lazy-loads on first use.
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
    CLIP_DEVICE,
    CLIP_EMBED_DIM,
    CLIP_MODEL_NAME,
    CLIP_PRETRAINED,
)
from core.utils.log import get_logger          # FIX: was logging.py

logger = get_logger(__name__)

_model: Optional[open_clip.CLIP] = None
_preprocess = None
_tokenizer  = None


def _load_model() -> None:
    global _model, _preprocess, _tokenizer
    if _model is not None:
        return
    logger.info(f"Loading CLIP {CLIP_MODEL_NAME} ({CLIP_PRETRAINED})…")
    _model, _, _preprocess = open_clip.create_model_and_transforms(
        CLIP_MODEL_NAME, pretrained=CLIP_PRETRAINED, device=CLIP_DEVICE,
    )
    _tokenizer = open_clip.get_tokenizer(CLIP_MODEL_NAME)
    _model.eval()
    logger.info("CLIP ready ✓")


def embed_images(paths: list[str | Path]) -> np.ndarray:
    """Returns (N, 512) float32 L2-normalised image embeddings."""
    _load_model()
    all_embeddings: list[np.ndarray] = []

    for i in range(0, len(paths), BATCH_SIZE):
        batch   = paths[i : i + BATCH_SIZE]
        images  = []

        for p in batch:
            try:
                img = _preprocess(Image.open(p).convert("RGB"))
                images.append(img)
            except Exception as e:
                logger.warning(f"Cannot open {Path(p).name}: {e}")

        if not images:
            continue

        tensor = torch.stack(images).to(CLIP_DEVICE)
        with torch.no_grad():
            feats = _model.encode_image(tensor)
            feats = feats / feats.norm(dim=-1, keepdim=True)

        all_embeddings.append(feats.cpu().numpy().astype(np.float32))
        logger.debug(f"Embedded batch {i // BATCH_SIZE + 1} ({len(images)} images)")

    if not all_embeddings:
        return np.zeros((0, CLIP_EMBED_DIM), dtype=np.float32)
    return np.concatenate(all_embeddings, axis=0)


def embed_text(text: str) -> np.ndarray:
    """Returns (512,) float32 L2-normalised text embedding."""
    _load_model()
    tokens = _tokenizer([text]).to(CLIP_DEVICE)
    with torch.no_grad():
        feats = _model.encode_text(tokens)
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats.cpu().numpy()[0].astype(np.float32)