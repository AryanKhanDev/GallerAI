"""
core/ingest/scanner.py
Scan directory, hash images, return records.
Incremental + AVIF-safe.
Fixed cache behavior after DB resets.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Iterator

from PIL import Image

from core.utils.config import (
    CACHE_DIR,
    DB_DIR,
    SUPPORTED_EXTENSIONS,
)
from core.utils.log import get_logger
from core.utils.schemas import ImageRecord

logger = get_logger(__name__)

HASH_CACHE_PATH = (
    CACHE_DIR
    / "indexed_hashes.json"
)

# temporary safety valve
HEAVY_EXTENSIONS = {
    ".avif",
}


def _load_hash_cache() -> set[str]:

    # IMPORTANT:
    # If DB was deleted,
    # invalidate stale cache too.
    if not DB_DIR.exists():
        return set()

    if HASH_CACHE_PATH.exists():
        try:
            return set(
                json.loads(
                    HASH_CACHE_PATH.read_text()
                )
            )
        except Exception:
            return set()

    return set()


def _save_hash_cache(
    hashes: set[str],
) -> None:

    HASH_CACHE_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    HASH_CACHE_PATH.write_text(
        json.dumps(
            list(hashes)
        )
    )


def _file_hash(
    path: Path,
) -> str:

    h = hashlib.sha256()

    with open(
        path,
        "rb",
    ) as f:

        for chunk in iter(
            lambda: f.read(65536),
            b"",
        ):
            h.update(
                chunk
            )

    return h.hexdigest()


def _image_dimensions(
    path: Path,
) -> tuple[int, int] | tuple[None, None]:

    try:
        with Image.open(
            path
        ) as img:
            return img.size

    except Exception:
        return (
            None,
            None,
        )


def scan_directory(
    directory: str | Path,
    *,
    recursive: bool = True,
) -> Iterator[ImageRecord]:

    directory = Path(
        directory
    )

    if not directory.exists():
        raise FileNotFoundError(
            f"Directory not found: {directory}"
        )

    known_hashes = (
        _load_hash_cache()
    )

    new_hashes: set[str] = set()

    glob = (
        directory.rglob("*")
        if recursive
        else directory.glob("*")
    )

    files = [
        f
        for f in glob
        if (
            f.suffix.lower()
            in SUPPORTED_EXTENSIONS
        )
    ]

    logger.info(
        f"Found {len(files)} "
        f"image files in {directory}"
    )

    skipped = 0

    for path in files:

        try:

            ext = (
                path.suffix.lower()
            )

            if (
                ext
                in HEAVY_EXTENSIONS
            ):
                logger.warning(
                    f"Skipping heavy format "
                    f"{path.name}"
                )
                continue

            file_hash = (
                _file_hash(path)
            )

            if (
                file_hash
                in known_hashes
            ):
                skipped += 1
                continue

            stat = path.stat()

            width, height = (
                _image_dimensions(
                    path
                )
            )

            record = ImageRecord(
                id=file_hash,
                path=str(
                    path.resolve()
                ),
                filename=path.name,
                created_at=datetime.fromtimestamp(
                    stat.st_ctime
                ),
                modified_at=datetime.fromtimestamp(
                    stat.st_mtime
                ),
                file_size_bytes=stat.st_size,
                width=width,
                height=height,
            )

            new_hashes.add(
                file_hash
            )

            yield record

        except Exception as e:

            logger.warning(
                f"Skipping "
                f"{path.name}: {e}"
            )

    _save_hash_cache(
        known_hashes
        | new_hashes
    )

    logger.info(
        f"Scan complete — "
        f"{len(new_hashes)} new, "
        f"{skipped} already indexed"
    )