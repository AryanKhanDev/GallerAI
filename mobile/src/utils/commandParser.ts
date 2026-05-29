/**
 * src/utils/commandParser.ts
 * Parses chat input to determine intent before sending to the API.
 *
 * Intents:
 *   query         → "show me shoes", "find receipt from yesterday"
 *   create_album  → "create album called Beach", "save these as Vacation"
 *   add_to_album  → "add these to Beach", "put them in Vacation album"
 *   delete_album  → "delete the Beach album"
 *   clear_chat    → "clear", "start over"
 */

export type CommandIntent =
  | { type: "query"; text: string }
  | { type: "create_album"; name: string; fromResults: boolean }
  | { type: "add_to_album"; albumName: string }
  | { type: "delete_album"; albumName: string }
  | { type: "clear_chat" };

const _CREATE_RE = /(?:create|make|save|start)\s+(?:an?\s+)?album\s+(?:called|named|as)?\s*["""']?([^"""']+)["""']?/i;
const _CREATE_THESE_RE = /(?:save|add|put)\s+(?:these|this|them)\s+(?:as|to|in(?:to)?)\s+(?:an?\s+)?album\s+(?:called|named)?\s*["""']?([^"""']+)["""']?/i;
const _ADD_RE = /(?:add|put)\s+(?:these|this|them)\s+(?:to|into|in)\s+(?:the\s+)?["""']?([^"""']+?)["""']?\s*(?:album)?$/i;
const _DELETE_RE = /(?:delete|remove)\s+(?:the\s+)?["""']?([^"""']+?)["""']?\s*album/i;
const _CLEAR_RE = /^(?:clear|reset|start over|new chat)$/i;

export function parseCommand(input: string): CommandIntent {
  const trimmed = input.trim();

  if (_CLEAR_RE.test(trimmed)) {
    return { type: "clear_chat" };
  }

  const createMatch = trimmed.match(_CREATE_RE);
  if (createMatch) {
    return {
      type: "create_album",
      name: createMatch[1].trim(),
      fromResults: false,
    };
  }

  const createTheseMatch = trimmed.match(_CREATE_THESE_RE);
  if (createTheseMatch) {
    return {
      type: "create_album",
      name: createTheseMatch[1].trim(),
      fromResults: true,
    };
  }

  const addMatch = trimmed.match(_ADD_RE);
  if (addMatch) {
    return {
      type: "add_to_album",
      albumName: addMatch[1].trim(),
    };
  }

  const deleteMatch = trimmed.match(_DELETE_RE);
  if (deleteMatch) {
    return {
      type: "delete_album",
      albumName: deleteMatch[1].trim(),
    };
  }

  // Default: treat as retrieval query
  return { type: "query", text: trimmed };
}

// Find an album by fuzzy name match
export function findAlbumByName(
  albums: { id: string; name: string }[],
  name: string
): { id: string; name: string } | undefined {
  const lower = name.toLowerCase();
  return (
    albums.find((a) => a.name.toLowerCase() === lower) ||
    albums.find((a) => a.name.toLowerCase().includes(lower)) ||
    albums.find((a) => lower.includes(a.name.toLowerCase()))
  );
}
