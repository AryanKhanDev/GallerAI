#!/usr/bin/env python
"""
scripts/ingest.py                    ← FIX #1: was Ingest.py (capital I)
CLI entrypoint for indexing a directory of images.

Usage (from repo root):
    python scripts/ingest.py --dir "C:/Users/you/Pictures"
    python scripts/ingest.py --dir "C:/Users/you/Pictures" --no-ocr
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.embed.clip_encoder import embed_images
from core.embed.ocr_extractor import batch_extract
from core.ingest.scanner import scan_directory
from core.ingest.store import ImageStore
from core.utils.log import get_logger          # FIX: was logging.py

logger = get_logger("ingest")


def run_ingest(directory: str, *, use_ocr: bool = True) -> None:
    store = ImageStore()
    logger.info(f"Starting ingestion: {directory}")
    logger.info(f"Already indexed: {store.count()} images")

    records = list(scan_directory(directory))
    if not records:
        logger.info("Nothing new to index.")
        return

    paths = [r.path for r in records]
    logger.info(f"New images: {len(records)}")

    # CLIP embeddings
    logger.info("Running CLIP embedding…")
    embeddings = embed_images(paths)

    # OCR
    ocr_texts = [None] * len(records)
    if use_ocr:
        logger.info("Running OCR…")
        ocr_texts = batch_extract(paths)

    # Attach to records
    for i, record in enumerate(records):
        if i < len(embeddings):
            record.embedding = embeddings[i].tolist()
        if ocr_texts[i]:
            record.ocr_text = ocr_texts[i]

    store.upsert(records)
    logger.info(f"✓ Done. Total in store: {store.count()}")


def main() -> None:
    parser = argparse.ArgumentParser(description="GallерAI — ingest images")
    parser.add_argument("--dir",    required=True, help="Directory to scan")
    parser.add_argument("--no-ocr", action="store_true", help="Skip OCR (faster)")
    args = parser.parse_args()
    run_ingest(args.dir, use_ocr=not args.no_ocr)


if __name__ == "__main__":
    main()