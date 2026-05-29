"""
core/utils/log.py
Structured logging — file + console.

FIX: renamed from logging.py to log.py.
The name 'logging' shadowed the stdlib module, causing a circular
import when this file did `import logging` internally.
All modules now import via: from core.utils.log import get_logger
"""

import logging
import sys

from core.utils.config import LOGS_DIR


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)

    if logger.handlers:          # avoid duplicate handlers on re-import
        return logger

    logger.setLevel(logging.DEBUG)
    logger.propagate = False          # stop double-printing via root logger
    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )

    # Console — INFO and above
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    # File — DEBUG and above (full detail for debugging retrieval scores)
    fh = logging.FileHandler(LOGS_DIR / "gallerai.log", encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    return logger