````markdown
# GALLERAI

An AI-powered local gallery that combines visual-semantic retrieval, OCR, and image metadata to enable natural-language search and intelligent management of personal image collections.

**User Query → Query Analysis → Semantic / OCR / Metadata Retrieval → Hybrid Scoring → Confidence Filtering → Results**

## Architecture

### Hybrid Retrieval Pipeline

**Semantic Retrieval** — Local OpenCLIP/CLIP embeddings for visual and conceptual similarity.

**OCR Retrieval** — PaddleOCR with lexical, document-type, and dense OCR signals for text-heavy images.

**Metadata Retrieval** — Image metadata and GallerAI-specific metadata for temporal, file, and upload-based queries.

**Hybrid Scoring** — Query-aware gating and weighted score fusion combine retrieval signals while preventing irrelevant OCR matches from dominating visual results.

### Context-Aware Retrieval

**Chat** — Adaptive confidence filtering returns only sufficiently relevant results for conversational queries.

**Gallery** — Semantic filtering, AND-style tags, relevance ranking, and relevance dimming support broader visual exploration.

### Dual Metadata Model

GallerAI maintains two distinct metadata layers:

**Image Metadata**
- Capture/creation time
- Modification time
- Dimensions
- Location when available

**GallerAI Metadata**
- Upload time/date
- Upload context/location when available
- GallerAI-specific image state

This distinction allows queries such as `photos taken yesterday` and `photos I uploaded yesterday` to resolve against different timestamps.

## Features

- Natural-language semantic image search
- OCR-assisted image retrieval
- Metadata-aware retrieval
- Automatic image indexing on upload
- Persistent albums and membership management
- Multi-selection across Gallery, Albums, and Chat
- Response-scoped Select All in Chat
- Native multi-image sharing
- Virtual Bin with soft-delete and restore
- Permanent deletion
- Album deletion without deleting contained images
- Persistent LanceDB schema migration
- Light/dark theme support

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native, Expo Router |
| Language | TypeScript, Python |
| State | Zustand |
| Backend | FastAPI |
| Vision | OpenCLIP / CLIP |
| OCR | PaddleOCR |
| Vector Store | LanceDB |

## Project Structure

```text
GALLERAI/
├── backend/
│   ├── api/
│   │   └── main.py
│   └── core/
│       ├── ingest/
│       │   └── store.py
│       ├── retrieve/
│       └── utils/
│           └── schemas.py
├── mobile/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── store/
│   │   └── utils/
│   └── package.json
├── core/
│   ├── embedding/
│   ├── ingest/
│   ├── retrieve/
│   └── utils/
├── scripts/
└── data/
    ├── lancedb/
    ├── cache/
    └── logs/
````

## Database

**LanceDB** — stores local image embeddings and indexed retrieval data.

**Image Records** — contain image identifiers, embeddings, OCR information, metadata, and deletion state.

**Albums** — persistent album definitions and image memberships.

**Bin** — virtual system collection derived from image deletion state rather than stored as a normal album.

## Getting Started

### Prerequisites

* Python 3.10+
* Node.js
* Expo development environment

### 1. Backend Setup

```bash
python -m venv .venv
```

Windows:

```powershell
.venv\Scripts\activate
```

macOS / Linux:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r backend/requirements.txt
```

Start the API:

```bash
uvicorn backend.api.main:app --reload
```

### 2. Mobile Setup

In a separate terminal:

```bash
cd mobile
npm install
npx expo start
```

Both the FastAPI backend and Expo application are required during development.

## API Endpoints

| Method | Endpoint                       | Description                             |
| ------ | ------------------------------ | --------------------------------------- |
| POST   | `/upload`                      | Upload and automatically index an image |
| POST   | `/query`                       | Run image retrieval                     |
| GET    | `/albums`                      | List albums                             |
| POST   | `/albums`                      | Create an album                         |
| PATCH  | `/albums/{album_id}`           | Rename an album                         |
| DELETE | `/albums/{album_id}`           | Delete an album                         |
| POST   | `/albums/{album_id}/images`    | Add images to an album                  |
| POST   | `/images/{image_id}/delete`    | Move an image to Bin                    |
| POST   | `/images/{image_id}/restore`   | Restore an image                        |
| DELETE | `/images/{image_id}/permanent` | Permanently delete an image             |
| GET    | `/bin`                         | List deleted images                     |
| POST   | `/bin/clear`                   | Permanently clear Bin                   |
| GET    | `/health`                      | Backend health/status                   |

## Image Processing

Images uploaded through GallerAI are automatically processed:

```text
Upload
  ↓
Metadata Extraction
  ↓
CLIP Embedding + OCR
  ↓
LanceDB
  ↓
Retrieval
```

No separate ingestion step is required for normal application usage.

## Selection & Sharing

Long-pressing an image enters multi-selection mode.

Selection actions include:

* Add to Album
* Share
* New Album
* Delete
* Select All / Clear

Chat selection is scoped to the current response bubble, preventing Select All from affecting unrelated responses.

Selected local images can be passed to native iOS/Android sharing APIs for multi-image sharing.

## Bin

Deletion uses a soft-delete model:

```text
Delete → Bin → Restore
              └→ Permanent Delete
```

Deleted images are excluded from normal Gallery and retrieval results. The Bin is a system collection and cannot be renamed, deleted, or used as an album destination.

## Current Status

Implemented:

* Hybrid semantic/OCR/metadata retrieval
* Chat and Gallery retrieval modes
* Automatic upload and indexing
* Persistent albums
* Multi-selection and bulk actions
* Response-scoped Chat selection
* Native multi-image sharing
* Soft-delete, restore, and permanent deletion
* Album deletion
* Persistent LanceDB schema migration
* Dual-layer metadata foundation
* Cross-platform UI and theming

## Roadmap

* Improve retrieval accuracy and query understanding
* Expand metadata and temporal retrieval
* GallerAI conversational agent
* Context-aware gallery actions
* Independent conversation contexts

## License

MIT

```
```
