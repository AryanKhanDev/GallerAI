import { Platform } from "react-native";

/**
 * Base URL for the GallерAI backend.
 *
 * - Web uses localhost.
 * - Android emulator uses 10.0.2.2 to reach the host machine.
 * - iOS simulator also uses localhost.
 */
export const BASE_URL =
  Platform.OS === "android"
    ? "http://10.0.2.2:8000"
    : "http://localhost:8000";

export function imageUrl(
  id: string
) {
  return `${BASE_URL}/image/${id}`;
}

export function thumbnailUrl(
  id: string
) {
  return `${BASE_URL}/thumbnail/${id}`;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type QueryMode =
  | "chat"
  | "gallery";

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
  topK = 20,
  mode: QueryMode =
    "gallery"
): Promise<QueryResponse> {
  const res =
    await fetch(
      `${BASE_URL}/query`,
      {
        method:
          "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify(
            {
              query,
              top_k:
                topK,
              mode,
            }
          ),
      }
    );

  if (!res.ok)
    throw new Error(
      `Query failed: ${res.status}`
    );

  return res.json();
}

// ── Gallery ────────────────────────────────────────────────────────────────

export async function listImages(
  limit = 200,
  offset = 0
): Promise<{
  total: number;
  images: GalleryImage[];
}> {
  const res =
    await fetch(
      `${BASE_URL}/images?limit=${limit}&offset=${offset}`
    );

  if (!res.ok)
    throw new Error(
      `List images failed: ${res.status}`
    );

  return res.json();
}

// ── Upload ─────────────────────────────────────────────────────────────────

export async function uploadImage(
  uri: string,
  filename?: string
): Promise<GalleryImage> {
  const name =
    filename ||
    uri.split("/").pop() ||
    `upload_${Date.now()}.jpg`;

  const match = /\.(\w+)$/.exec(name);
  const ext = match ? match[1].toLowerCase() : "jpg";
  const mime = `image/${ext === "jpg" ? "jpeg" : ext}`;

  const form = new FormData();
  // @ts-ignore - RN FormData accepts this shape for file uploads
  form.append("file", { uri, name, type: mime });

  const res = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok)
    throw new Error(
      `Upload failed: ${res.status}`
    );

  return res.json();
}

// ── Albums ─────────────────────────────────────────────────────────────────

export async function listAlbums(): Promise<Album[]> {
  const res =
    await fetch(
      `${BASE_URL}/albums`
    );

  if (!res.ok)
    throw new Error(
      `List albums failed: ${res.status}`
    );

  const data =
    await res.json();

  return data.albums;
}

export async function createAlbum(
  name: string,
  imageIds: string[],
  query?: string,
  description?: string
): Promise<Album> {
  const res =
    await fetch(
      `${BASE_URL}/albums`,
      {
        method:
          "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify(
            {
              name,
              image_ids:
                imageIds,
              query,
              description,
            }
          ),
      }
    );

  if (!res.ok)
    throw new Error(
      `Create album failed: ${res.status}`
    );

  return res.json();
}

export async function getAlbum(
  albumId: string
): Promise<Album> {
  const res =
    await fetch(
      `${BASE_URL}/albums/${albumId}`
    );

  if (!res.ok)
    throw new Error(
      `Get album failed: ${res.status}`
    );

  return res.json();
}

export async function addToAlbum(
  albumId: string,
  imageIds: string[]
): Promise<void> {
  const res =
    await fetch(
      `${BASE_URL}/albums/${albumId}/add`,
      {
        method:
          "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify(
            {
              image_ids:
                imageIds,
            }
          ),
      }
    );

  if (!res.ok)
    throw new Error(
      `Add to album failed: ${res.status}`
    );
}

export async function deleteAlbum(
  albumId: string
): Promise<void> {
  const res =
    await fetch(
      `${BASE_URL}/albums/${albumId}`,
      {
        method:
          "DELETE",
      }
    );

  if (!res.ok)
    throw new Error(
      `Delete album failed: ${res.status}`
    );
}

export async function removeFromAlbum(
  albumId: string,
  imageId: string
): Promise<void> {
  const res =
    await fetch(
      `${BASE_URL}/albums/${albumId}/images/${imageId}`,
      {
        method:
          "DELETE",
      }
    );

  if (!res.ok)
    throw new Error(
      `Remove from album failed: ${res.status}`
    );
}

export async function renameAlbum(
  albumId: string,
  name: string
): Promise<Album> {
  const res =
    await fetch(
      `${BASE_URL}/albums/${albumId}`,
      {
        method:
          "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify(
            {
              name,
            }
          ),
      }
    );

  if (!res.ok)
    throw new Error(
      `Rename album failed: ${res.status}`
    );

  return res.json();
}
// ── Health ─────────────────────────────────────────────────────────────────

export async function health(): Promise<{
  status: string;
  indexed: number;
}> {
  const res =
    await fetch(
      `${BASE_URL}/health`
    );

  if (!res.ok)
    throw new Error(
      "Health check failed"
    );

  return res.json();
}