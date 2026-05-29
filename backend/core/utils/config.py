"""
core/utils/config.py
Central config.
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
CLIP_DEVICE     = "cpu"
BATCH_SIZE      = 8

# ---------------------------------------------------------------------------
# LanceDB
# ---------------------------------------------------------------------------

LANCE_TABLE_NAME = "images"

# ---------------------------------------------------------------------------
# Retrieval fusion weights
#
# When OCR fires it should dominate — it means there is hard text evidence.
# Semantic is the baseline; OCR is the differentiator.
#
# These weights apply only to ACTIVE experts per query.
# Semantic-only queries are unaffected by OCR weight.
# ---------------------------------------------------------------------------

FUSION_WEIGHTS = {
    "semantic": 0.35,
    "ocr":      0.55,   # OCR evidence is strong signal — let it rank
    "metadata": 0.10,
    "tags":     0.00,
}

# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

DEFAULT_TOP_K      = 20
SEMANTIC_THRESHOLD = 0.20   # minimum score for semantic-only results

# ---------------------------------------------------------------------------
# Supported image formats
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS = {
    ".jpg", ".jpeg", ".jfif",
    ".png",
    ".webp",
    ".heic",
    ".avif",
    ".gif",
    ".bmp",
    ".tiff", ".tif",
}

# ---------------------------------------------------------------------------
# OCR
# ---------------------------------------------------------------------------

OCR_ENABLED        = True
OCR_CONFIDENCE_MIN = 0.45