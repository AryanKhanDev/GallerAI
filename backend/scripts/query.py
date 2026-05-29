#!/usr/bin/env python
"""
scripts/query.py                     ← FIX #1: was Query.py (capital Q)
CLI entrypoint for querying the indexed gallery.

Usage (from repo root):
    python scripts/query.py "mountains"
    python scripts/query.py "gas bill from last saturday" --debug
    python scripts/query.py "shoes" --top 20
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.ingest.store import ImageStore
from core.retrieve.retriever import Retriever
from core.retrieve.router import parse_query
from core.utils.log import get_logger          # FIX: was logging.py

logger = get_logger("query")

RESET  = "\033[0m"
BOLD   = "\033[1m"
CYAN   = "\033[96m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
DIM    = "\033[2m"


def run_query(raw: str, top_k: int = 10, debug: bool = False) -> None:
    store = ImageStore()
    if store.count() == 0:
        print(f"{YELLOW}⚠  Store is empty. Run ingest.py first.{RESET}")
        return

    parsed    = parse_query(raw)
    retriever = Retriever(store)
    result    = retriever.search(parsed, top_k=top_k)

    print(f"\n{BOLD}{CYAN}GallерAI Query{RESET}")
    print(f"  Query   : {BOLD}{raw}{RESET}")
    print(f"  Experts : {', '.join(e.value for e in parsed.experts)}")
    if parsed.date_filter:
        print(f"  Date    : {parsed.date_filter.label}")
    print(f"  Results : {len(result.results)} | {result.latency_ms:.1f}ms\n")

    if not result.results:
        print(f"{YELLOW}  No results found.{RESET}")
        return

    for i, r in enumerate(result.results, 1):
        print(f"  {GREEN}{i:>2}.{RESET} {r.record.filename}")
        print(f"      Score : {BOLD}{r.final_score:.3f}{RESET}")
        if debug:
            for es in r.expert_scores:
                print(f"      {DIM}{es.expert.value:<10} {es.score:.3f}{RESET}")
        print(f"      Path  : {DIM}{r.record.path}{RESET}")
        if r.record.ocr_text:
            preview = r.record.ocr_text[:80].replace("\n", " ")
            print(f"      OCR   : {DIM}\"{preview}…\"{RESET}")
        print()


def main() -> None:
    parser = argparse.ArgumentParser(description="GallерAI — query your gallery")
    parser.add_argument("query",   help="Natural language query")
    parser.add_argument("--top",   type=int, default=10, help="Number of results")
    parser.add_argument("--debug", action="store_true",  help="Show per-expert scores")
    args = parser.parse_args()
    run_query(args.query, top_k=args.top, debug=args.debug)


if __name__ == "__main__":
    main()