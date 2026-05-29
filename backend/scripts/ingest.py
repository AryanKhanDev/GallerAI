#!/usr/bin/env python

import argparse
import sys
from pathlib import Path

from PIL import Image
import numpy as np

sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[1]),
)

from core.embed.clip_encoder import (
    embed_images,
    embed_text,
)
from core.embed.ocr_extractor import (
    batch_extract,
)
from core.ingest.scanner import (
    scan_directory,
)
from core.ingest.store import (
    ImageStore,
)
from core.utils.config import (
    CLIP_EMBED_DIM,
)


def _zero_vec():

    return (
        np.zeros(
            CLIP_EMBED_DIM,
            dtype=np.float32,
        )
        .tolist()
    )


def run_ingest(
    directory,
    *,
    use_ocr=True,
):

    store = ImageStore()

    records = list(
        scan_directory(directory)
    )

    images = []

    for r in records:
        try:
            images.append(
                Image.open(
                    r.path
                ).convert(
                    "RGB"
                )
            )
        except Exception:
            images.append(
                None
            )

    valid = [
        i
        for i in images
        if i is not None
    ]

    img_embs = embed_images(
        valid
    )

    if use_ocr:
        chunk_lists = (
            batch_extract(
                valid
            )
        )
    else:
        chunk_lists = [
            []
            for _ in valid
        ]

    emb_i = 0

    for i, r in enumerate(records):

        if images[i] is None:
            continue

        # image embedding
        r.embedding = (
            img_embs[
                emb_i
            ].tolist()
        )

        # compatibility fields
        chunks = (
            chunk_lists[
                emb_i
            ]
        )

        r.ocr_chunks = chunks
        r.ocr_chunk_embeddings = []

        if chunks:

            ocr_text = (
                " ".join(
                    chunks
                ).strip()
            )

            r.ocr_text = (
                ocr_text
            )

            r.ocr_embedding = (
                embed_text(
                    ocr_text
                ).tolist()
            )

        else:

            r.ocr_text = None

            # IMPORTANT:
            # Lance fixed-size list
            r.ocr_embedding = (
                _zero_vec()
            )

        emb_i += 1

    store.upsert(
        records
    )

    print(
        f"Store={store.count()}"
    )


def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--dir",
        required=True,
    )

    parser.add_argument(
        "--no-ocr",
        action="store_true",
    )

    args = parser.parse_args()

    run_ingest(
        args.dir,
        use_ocr=not args.no_ocr,
    )


if __name__ == "__main__":
    main()