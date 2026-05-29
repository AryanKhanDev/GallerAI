from core.ingest.store import ImageStore
import numpy as np

store = ImageStore()
records = store.get_all()

print("Total indexed:", len(records))

for r in records:

    emb = r.get("embedding")
    if emb is None:
        emb = []

    ocr_emb = r.get("ocr_embedding")
    if ocr_emb is None:
        ocr_emb = []

    emb_ok = (
        len(emb) == 512
        and not np.allclose(
            np.array(emb),
            0,
        )
    )

    print(
        f"{r.get('filename','?'):30s}  "
        f"emb={'OK' if emb_ok else 'ZERO/BAD':7s}  "
        f"ocr_text={bool(r.get('ocr_text'))}  "
        f"ocr_emb_len={len(ocr_emb)}"
    )
