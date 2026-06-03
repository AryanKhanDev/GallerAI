/**
 * src/store/selectionStore.ts
 * Universal image selection engine.
 * Shared between Chat query results, Gallery, and Albums.
 */

import { create } from "zustand";

export type SelectionContext =
  | "chat"
  | "gallery"
  | "album"
  | null;

interface SelectionState {
  selectedIds: Set<string>;
  isSelecting: boolean;
  context: SelectionContext;

  // Enter selection mode
  enterSelection: (
    firstId: string,
    context: SelectionContext
  ) => void;

  // Exit selection completely
  exitSelection: () => void;

  // Toggle a single image
  toggleId: (
    id: string
  ) => void;

  // Select all
  selectAll: (
    ids: string[]
  ) => void;

  // Clear + exit
  clearAll: () => void;

  // Query helpers
  isSelected: (
    id: string
  ) => boolean;

  selectedArray: () => string[];
}

export const useSelectionStore =
  create<SelectionState>(
    (set, get) => ({
      selectedIds:
        new Set(),

      isSelecting:
        false,

      context:
        null,

      enterSelection: (
        firstId,
        context
      ) =>
        set({
          selectedIds:
            new Set([
              firstId,
            ]),
          isSelecting:
            true,
          context,
        }),

      exitSelection:
        () =>
          set({
            selectedIds:
              new Set(),
            isSelecting:
              false,
            context:
              null,
          }),

      toggleId: (
        id
      ) =>
        set((s) => {
          const next =
            new Set(
              s.selectedIds
            );

          if (
            next.has(
              id
            )
          ) {
            next.delete(
              id
            );

            if (
              next.size ===
              0
            ) {
              return {
                selectedIds:
                  next,
                isSelecting:
                  false,
                context:
                  null,
              };
            }
          } else {
            next.add(id);
          }

          return {
            selectedIds:
              next,
          };
        }),

      selectAll: (
        ids
      ) =>
        set((s) => ({
          selectedIds:
            new Set([
              ...s.selectedIds,
              ...ids,
            ]),
          isSelecting:
            true,
        })),

      clearAll:
        () =>
          set({
            selectedIds:
              new Set(),
            isSelecting:
              false,
            context:
              null,
          }),

      isSelected: (
        id
      ) =>
        get().selectedIds.has(
          id
        ),

      selectedArray:
        () =>
          Array.from(
            get()
              .selectedIds
          ),
    })
  );