export type ShareImagesOptions = {
  /**
   * MIME type hint passed to the native share sheet. Defaults to "image/*".
   * Reserved for future variants (e.g. "application/pdf" for a future
   * "share as PDF" feature) without changing the shareImages() signature.
   */
  mimeType?: string;

  /** Android chooser dialog title. Ignored on iOS (no equivalent API). */
  dialogTitle?: string;
};

export type ShareImagesNativeModule = {
  /**
   * Presents the native share sheet for one or more local file/content URIs.
   * - Android: ACTION_SEND (single) / ACTION_SEND_MULTIPLE (multiple).
   * - iOS: UIActivityViewController.
   *
   * Expects file:// or content:// URIs. Remote (http/https) URLs are not
   * guaranteed to work reliably as ACTION_SEND_MULTIPLE stream extras on
   * Android — callers should resolve remote URLs to local files first
   * (see src/native/share.ts).
   */
  shareImages(uris: string[], options?: ShareImagesOptions): Promise<void>;
};
