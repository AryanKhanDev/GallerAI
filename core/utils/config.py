"""
core/utils/config.py
Central config. Change values here, not scattered across files.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT_DIR  = Path(__file__).resolve().parents[2]
DATA_DIR  = ROOT_DIR / "data"
DB_DIR    = DATA_DIR / "lancedb"
LOGS_DIR  = DATA_DIR / "logs"
CACHE_DIR = DATA_DIR / "cache"

for _d in (DATA_DIR, DB_DIR, LOGS_DIR, CACHE_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# CLIP
# ---------------------------------------------------------------------------

CLIP_MODEL_NAME = "ViT-B-32"
CLIP_PRETRAINED = "openai"
CLIP_EMBED_DIM  = 512
CLIP_DEVICE     = "cpu"     # "cuda" if GPU available

# ---------------------------------------------------------------------------
# LanceDB
# ---------------------------------------------------------------------------

LANCE_TABLE_NAME = "images"

# ---------------------------------------------------------------------------
# Retrieval fusion weights (must sum to 1.0)
# ---------------------------------------------------------------------------

FUSION_WEIGHTS = {
    "semantic": 0.45,
    "ocr":      0.25,
    "metadata": 0.15,
    "tags":     0.15,
}

# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

DEFAULT_TOP_K      = 20
SEMANTIC_THRESHOLD = 0.20

# ---------------------------------------------------------------------------
# Ingestion
# FIX #3: added .jfif (JPEG variant common on Windows/phones) and .avif
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS = {
    ".jpg", ".jpeg", ".jfif",   # JPEG family
    ".png",
    ".webp",
    ".heic",                     # iPhone default format
    ".avif",                     # modern format — requires Pillow >= 10.1
    ".gif",
    ".bmp",
    ".tiff", ".tif",
}

BATCH_SIZE = 32

# ---------------------------------------------------------------------------
# OCR
# ---------------------------------------------------------------------------

OCR_ENABLED       = True
OCR_CONFIDENCE_MIN = 0.6