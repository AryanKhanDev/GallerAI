/**
 * src/api/client.ts
 * All communication with the GallерAI FastAPI backend.
 *
 * DEV:  set BASE_URL to your machine's local IP on WiFi
 *       e.g. http://192.168.1.42:8000
 * PROD: will become http://localhost:8000 once Python is bundled on-device
 */

// ─── CHANGE THIS to your Windows machine's local IP ────────────────────────
export const BASE_URL = "http://localhost:8000";
// ───────────────────────────────────────────────────────────────────────────

export function imageUrl(id: string) {
  return `${BASE_URL}/image/${id}`;
}

export function thumbnailUrl(id: string) {
  return `${BASE_URL}/thumbnail/${id}`;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface ImageResult {
  id: string;
  filename: string;
  path: string;
  score: number;
  semantic_score?: number;
  ocr_score?: number;
  ocr_text?: string;
  created_at?: string;
  width?: number;
  height?: number;
  thumbnail_url: string;
  image_url: string;
}

export interface QueryResponse {
  query: string;
  experts: string[];
  results: ImageResult[];
  latency_ms: number;
  total: number;
}

export interface Album {
  id: string;
  name: string;
  description?: string;
  query?: string;
  image_ids: string[];
  created_at: string;
  cover_image_id?: string;
}

export interface GalleryImage {
  id: string;
  filename: string;
  path: string;
  created_at: string;
  width?: number;
  height?: number;
  has_ocr: boolean;
  thumbnail_url: string;
  image_url: string;
}

// ── Query ──────────────────────────────────────────────────────────────────

export async function queryImages(
  query: string,
  topK = 20
): Promise<QueryResponse> {
  const res = await fetch(`${BASE_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) throw new Error(`Query failed: ${res.status}`);
  return res.json();
}

// ── Gallery ────────────────────────────────────────────────────────────────

export async function listImages(
  limit = 200,
  offset = 0
): Promise<{ total: number; images: GalleryImage[] }> {
  const res = await fetch(
    `${BASE_URL}/images?limit=${limit}&offset=${offset}`
  );
  if (!res.ok) throw new Error(`List images failed: ${res.status}`);
  return res.json();
}

// ── Albums ─────────────────────────────────────────────────────────────────

export async function listAlbums(): Promise<Album[]> {
  const res = await fetch(`${BASE_URL}/albums`);
  if (!res.ok) throw new Error(`List albums failed: ${res.status}`);
  const data = await res.json();
  return data.albums;
}

export async function createAlbum(
  name: string,
  imageIds: string[],
  query?: string,
  description?: string
): Promise<Album> {
  const res = await fetch(`${BASE_URL}/albums`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, image_ids: imageIds, query, description }),
  });
  if (!res.ok) throw new Error(`Create album failed: ${res.status}`);
  return res.json();
}

export async function getAlbum(albumId: string): Promise<Album> {
  const res = await fetch(`${BASE_URL}/albums/${albumId}`);
  if (!res.ok) throw new Error(`Get album failed: ${res.status}`);
  return res.json();
}

export async function addToAlbum(
  albumId: string,
  imageIds: string[]
): Promise<void> {
  const res = await fetch(`${BASE_URL}/albums/${albumId}/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_ids: imageIds }),
  });
  if (!res.ok) throw new Error(`Add to album failed: ${res.status}`);
}

export async function deleteAlbum(albumId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/albums/${albumId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete album failed: ${res.status}`);
}

export async function removeFromAlbum(
  albumId: string,
  imageId: string
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/albums/${albumId}/images/${imageId}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(`Remove from album failed: ${res.status}`);
}

// ── Health ─────────────────────────────────────────────────────────────────

export async function health(): Promise<{ status: string; indexed: number }> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}
