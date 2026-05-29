/**
 * src/store/index.ts
 * Global state via Zustand.
 * Chat history, gallery images, albums, active tag filter.
 */

import { create } from "zustand";
import { ImageResult, Album, GalleryImage } from "../api/client";

// ── Chat ───────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  images?: ImageResult[];
  action?: "query" | "album_created" | "added_to_album" | "error";
  albumId?: string;
  latency_ms?: number;
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (msg: ChatMessage) => void;
  setLoading: (v: boolean) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),
  setLoading: (v) => set({ isLoading: v }),
  clearChat: () => set({ messages: [], isLoading: false }),
}));

// ── Gallery ────────────────────────────────────────────────────────────────

interface GalleryState {
  images: GalleryImage[];
  total: number;
  activeTag: string;
  tagScores: Record<string, number>;
  isLoadingGallery: boolean;
  isTagging: boolean;
  setImages: (images: GalleryImage[], total: number) => void;
  setActiveTag: (tag: string) => void;
  setTagScores: (scores: Record<string, number>) => void;
  setLoadingGallery: (v: boolean) => void;
  setTagging: (v: boolean) => void;
}

export const useGalleryStore = create<GalleryState>((set) => ({
  images: [],
  total: 0,
  activeTag: "",
  tagScores: {},
  isLoadingGallery: false,
  isTagging: false,
  setImages: (images, total) => set({ images, total }),
  setActiveTag: (tag) => set({ activeTag: tag }),
  setTagScores: (scores) => set({ tagScores: scores }),
  setLoadingGallery: (v) => set({ isLoadingGallery: v }),
  setTagging: (v) => set({ isTagging: v }),
}));

// ── Albums ─────────────────────────────────────────────────────────────────

interface AlbumState {
  albums: Album[];
  isLoadingAlbums: boolean;
  setAlbums: (albums: Album[]) => void;
  addAlbum: (album: Album) => void;
  removeAlbum: (albumId: string) => void;
  updateAlbum: (album: Album) => void;
  setLoadingAlbums: (v: boolean) => void;
}

export const useAlbumStore = create<AlbumState>((set) => ({
  albums: [],
  isLoadingAlbums: false,
  setAlbums: (albums) => set({ albums }),
  addAlbum: (album) =>
    set((s) => ({ albums: [album, ...s.albums] })),
  removeAlbum: (albumId) =>
    set((s) => ({ albums: s.albums.filter((a) => a.id !== albumId) })),
  updateAlbum: (album) =>
    set((s) => ({
      albums: s.albums.map((a) => (a.id === album.id ? album : a)),
    })),
  setLoadingAlbums: (v) => set({ isLoadingAlbums: v }),
}));