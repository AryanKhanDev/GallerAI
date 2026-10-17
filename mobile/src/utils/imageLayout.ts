/** Square thumbnails sized to the measured content area on every platform. */
export function imageLayout(width: number, gap: number, minSize: number, maxSize: number) {
  const available = Math.max(1, width);
  // Add columns to respect the maximum; use the minimum as the preferred density.
  // Very narrow containers may need smaller cells to avoid overflow.
  const minColumns = Math.max(1, Math.ceil((available + gap) / (maxSize + gap)));
  const preferredColumns = Math.max(1, Math.floor((available + gap) / (minSize + gap)));
  const columns = Math.max(minColumns, preferredColumns);
  return { columns, size: Math.max(1, (available - gap * (columns - 1)) / columns) };
}
