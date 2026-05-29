"""
tests/test_api.py
API endpoint tests using FastAPI TestClient.
No running server required — tests in-process.

Run:
    pytest tests/test_api.py -v
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert "status" in data
    assert "indexed" in data
    assert data["status"] == "ok"


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

def test_query_returns_results():
    r = client.post("/query", json={"query": "mountains", "top_k": 5})
    assert r.status_code == 200
    data = r.json()
    assert "results" in data
    assert "latency_ms" in data
    assert "experts" in data
    assert isinstance(data["results"], list)


def test_query_result_shape():
    r = client.post("/query", json={"query": "shoes"})
    assert r.status_code == 200
    results = r.json()["results"]
    if results:
        img = results[0]
        assert "id" in img
        assert "filename" in img
        assert "score" in img
        assert "thumbnail_url" in img
        assert "image_url" in img


def test_query_empty_string_rejected():
    r = client.post("/query", json={"query": ""})
    assert r.status_code == 400


def test_query_semantic_only_for_shoes():
    r = client.post("/query", json={"query": "shoes"})
    assert r.status_code == 200
    # shoes should only use semantic expert
    assert "ocr" not in r.json()["experts"]


# ---------------------------------------------------------------------------
# Images list
# ---------------------------------------------------------------------------

def test_list_images():
    r = client.get("/images")
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
    assert "images" in data
    assert isinstance(data["images"], list)


def test_list_images_pagination():
    r = client.get("/images?limit=2&offset=0")
    assert r.status_code == 200
    assert len(r.json()["images"]) <= 2


# ---------------------------------------------------------------------------
# Image / thumbnail serving
# ---------------------------------------------------------------------------

def test_image_404_for_unknown():
    r = client.get("/image/nonexistent_hash_xyz")
    assert r.status_code == 404


def test_thumbnail_404_for_unknown():
    r = client.get("/thumbnail/nonexistent_hash_xyz")
    assert r.status_code == 404


def test_image_served_if_indexed():
    # Only runs meaningfully if store has images
    r = client.get("/images?limit=1")
    images = r.json()["images"]
    if not images:
        pytest.skip("Store empty — run ingest first")
    image_id = images[0]["id"]
    r2 = client.get(f"/image/{image_id}")
    assert r2.status_code == 200
    assert r2.headers["content-type"].startswith("image/")


def test_thumbnail_served_if_indexed():
    r = client.get("/images?limit=1")
    images = r.json()["images"]
    if not images:
        pytest.skip("Store empty — run ingest first")
    image_id = images[0]["id"]
    r2 = client.get(f"/thumbnail/{image_id}")
    assert r2.status_code == 200
    assert r2.headers["content-type"].startswith("image/")


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

def test_ingest_rejects_bad_directory():
    r = client.post("/ingest", json={"directory": "/nonexistent/path/xyz"})
    assert r.status_code == 400


def test_ingest_status():
    r = client.get("/ingest/status")
    assert r.status_code == 200
    data = r.json()
    assert "running" in data
    assert "message" in data


# ---------------------------------------------------------------------------
# Albums — full CRUD lifecycle
# ---------------------------------------------------------------------------

def test_album_list_initially_works():
    r = client.get("/albums")
    assert r.status_code == 200
    assert "albums" in r.json()


def test_album_create():
    r = client.post("/albums", json={
        "name": "Test Album",
        "description": "Created by test suite",
        "image_ids": [],
    })
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Test Album"
    assert "id" in data
    # Clean up
    client.delete(f"/albums/{data['id']}")


def test_album_create_with_images():
    r = client.post("/albums", json={
        "name": "With Images",
        "image_ids": ["fakeid1", "fakeid2"],
        "query": "mountains",
    })
    assert r.status_code == 200
    data = r.json()
    assert len(data["image_ids"]) == 2
    assert data["query"] == "mountains"
    assert data["cover_image_id"] == "fakeid1"
    client.delete(f"/albums/{data['id']}")


def test_album_get():
    create = client.post("/albums", json={"name": "Fetch Me", "image_ids": []})
    album_id = create.json()["id"]
    r = client.get(f"/albums/{album_id}")
    assert r.status_code == 200
    assert r.json()["name"] == "Fetch Me"
    client.delete(f"/albums/{album_id}")


def test_album_get_404():
    r = client.get("/albums/doesnotexist")
    assert r.status_code == 404


def test_album_add_images():
    create = client.post("/albums", json={"name": "Add Test", "image_ids": ["a"]})
    album_id = create.json()["id"]
    r = client.post(f"/albums/{album_id}/add", json={"image_ids": ["b", "c"]})
    assert r.status_code == 200
    assert r.json()["total"] == 3
    client.delete(f"/albums/{album_id}")


def test_album_add_deduplicates():
    create = client.post("/albums", json={"name": "Dedup Test", "image_ids": ["a", "b"]})
    album_id = create.json()["id"]
    r = client.post(f"/albums/{album_id}/add", json={"image_ids": ["b", "c"]})
    assert r.json()["added"] == 1   # b already exists
    assert r.json()["total"] == 3
    client.delete(f"/albums/{album_id}")


def test_album_remove_image():
    create = client.post("/albums", json={"name": "Remove Test", "image_ids": ["x", "y", "z"]})
    album_id = create.json()["id"]
    r = client.delete(f"/albums/{album_id}/images/y")
    assert r.status_code == 200
    assert r.json()["total"] == 2
    # Verify y is gone
    get = client.get(f"/albums/{album_id}")
    assert "y" not in get.json()["image_ids"]
    client.delete(f"/albums/{album_id}")


def test_album_delete():
    create = client.post("/albums", json={"name": "Delete Me", "image_ids": []})
    album_id = create.json()["id"]
    r = client.delete(f"/albums/{album_id}")
    assert r.status_code == 200
    assert r.json()["deleted"] == album_id
    # Confirm gone
    r2 = client.get(f"/albums/{album_id}")
    assert r2.status_code == 404