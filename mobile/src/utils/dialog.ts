/**
 * src/utils/dialog.ts
 *
 * Cross-platform confirmation / notice dialogs.
 *
 * React Native's Alert.alert() does not render at all on Expo Web —
 * not just multi-button confirmations, even a plain one-button notice
 * silently does nothing. So every destructive-action confirmation
 * (and any alert that needs to be visible on web) should go through
 * these helpers instead of calling Alert.alert directly or scattering
 * Platform.OS checks throughout the app.
 *
 * Usage:
 *   const confirmed = await confirm(
 *     "Move selected images to Bin?",
 *     "The selected images will be moved to Bin. You can restore them later from the Bin.",
 *     "Move to Bin"
 *   );
 *   if (!confirmed) return;
 *
 * This is the standard confirmation dialog for GallerAI going
 * forward — reuse it for Delete Album, Clear Bin, Permanently Delete,
 * Restore All, and any other destructive action, rather than calling
 * Alert.alert directly.
 */

import { Alert, Platform } from "react-native";

/**
 * Shows a two-button confirmation dialog and resolves to true if the
 * user picked the affirmative/destructive action, false otherwise
 * (including dismissing the dialog without choosing).
 *
 * @param title          Dialog title, e.g. "Delete album?"
 * @param message        Optional dialog body.
 * @param confirmLabel   Label for the affirmative/destructive button (default "OK").
 * @param cancelLabel    Label for the cancel button (default "Cancel").
 */
export function confirm(
  title: string,
  message?: string,
  confirmLabel = "OK",
  cancelLabel = "Cancel"
): Promise<boolean> {
  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    // window.confirm only ever has "OK"/"Cancel" — confirmLabel/cancelLabel
    // are folded into the text above so the intent is still visible on web.
    return Promise.resolve(
      window.confirm(
        confirmLabel !== "OK"
          ? `${text}\n\n(${confirmLabel} / ${cancelLabel})`
          : text
      )
    );
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        {
          text: cancelLabel,
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: confirmLabel,
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false),
      }
    );
  });
}

/**
 * Shows a single-button informational notice. Use this instead of
 * Alert.alert(title, message) for anything that needs to actually be
 * seen on web (e.g. "Could not delete album").
 */
export function notify(
  title: string,
  message?: string
): Promise<void> {
  if (Platform.OS === "web") {
    window.alert(message ? `${title}\n\n${message}` : title);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [{ text: "OK", onPress: () => resolve() }],
      { onDismiss: () => resolve() }
    );
  });
}