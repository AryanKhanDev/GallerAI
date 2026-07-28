/**
 * src/native/share.ts
 * Thin, reusable wrapper around the native ShareImages Expo Module.
 *
 * Callers (SelectionBar, and any future consumer) just pass image URIs —
 * this module owns all platform branching:
 *   - web:     window.open() fallback (no native share sheet exists)
 *   - iOS:     resolves local files, hands off to UIActivityViewController
 *   - Android: resolves local files (via FileProvider), hands off to
 *              ACTION_SEND / ACTION_SEND_MULTIPLE
 *
 * imageUriMap values are expected to be backend image_url endpoints
 * (e.g. `${BASE_URL}/image/{id}`), so remote http(s) URIs are downloaded
 * to local cache files first — required for reliable ACTION_SEND_MULTIPLE
 * behavior on Android, and kept consistent on iOS for the same reason.
 */

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
export interface ShareImagesOptions {
  dialogTitle?: string;
}

export async function shareImages(
  uris: string[],
  options?: ShareImagesOptions
): Promise<void> {
  const requested = uris.filter(Boolean);

  if (requested.length === 0) {
    throw new Error("No images to share.");
  }

  if (Platform.OS === "web") {
    // Preserve existing web behaviour: open the first image in a new tab.
    window.open(requested[0], "_blank");
    return;
  }

  const resolved = await Promise.all(
    requested.map((uri) => resolveLocalUri(uri))
  );

  const shareable = resolved.filter(
    (uri): uri is string => !!uri
  );

  if (shareable.length === 0) {
    throw new Error("Could not prepare any images for sharing.");
  }

  const { default: ShareImagesNativeModule } = await import(
  "expo-share-images"
);

await ShareImagesNativeModule.shareImages(shareable, {
  dialogTitle:
    shareable.length > 1
      ? `Share ${shareable.length} photos`
      : "Share photo",
  ...options,
});
}

/**
 * Local file:// and content:// URIs pass through untouched. Remote
 * http(s) URIs are downloaded into the app cache directory. Returns null
 * (rather than throwing) on failure so a single bad URI can't block
 * sharing the rest of the selection — see requirement to "handle missing
 * URIs gracefully".
 */
async function resolveLocalUri(uri: string): Promise<string | null> {
  try {
    if (uri.startsWith("file://") || uri.startsWith("content://")) {
      return uri;
    }

    const filename =
      uri.split("/").pop()?.split("?")[0] || `${Date.now()}.jpg`;

    const destination = FileSystem.cacheDirectory + filename;

    const { uri: downloadedUri } = await FileSystem.downloadAsync(
      uri,
      destination
    );

    return downloadedUri;
  } catch {
    return null;
  }
}
