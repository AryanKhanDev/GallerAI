/**
 * src/components/SelectionBar.tsx
 *
 * Floating bar that appears whenever selection mode is active.
 * Shared between Gallery, Albums, and Chat.
 *
 * showSelectAll: controls the "All"/"Clear" toggle. It stays in the
 * layout either way (so cancel/count/etc never shift position) but
 * the whole pill — background included — is invisible and
 * non-interactive when false, used to hide it on the main Gallery
 * grid while keeping it in Chat and Album views.
 *
 * Delete: soft-deletes the current selection (moves to Bin). This is
 * intentionally NOT a permanent delete — it just flips is_deleted on
 * the backend, so it's fully reversible from the Bin. Confirms first,
 * then exits selection and calls onDeleted so the screen that owns
 * the current view (Gallery grid or an open Album) can refetch and
 * make the images disappear immediately.
 */

import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
} from "react-native";

import {
  useSelectionStore,
} from "../store";

import {
  colors,
  spacing,
  radius,
  font,
} from "../utils/theme";

import { shareImages } from "../native/share";
import { deleteImage } from "../api/client";

interface Props {
  allIds: string[];

  imageUriMap: Record<string, string>;

  onAddToAlbum: (
    ids: string[]
  ) => void;

  onCreateAlbum: (
    ids: string[]
  ) => void;

  onCancel: () => void;

  showSelectAll?: boolean;

  /** Called after the selected images have been successfully moved to
   * the Bin, with the ids that were deleted. Use this to refetch
   * whatever list is currently on screen (main gallery / open album)
   * so the deleted images disappear immediately. Optional — screens
   * that don't need to react (e.g. Chat, where results are historical
   * messages) can omit it. */
  onDeleted?: (ids: string[]) => void;
}

export default function SelectionBar({
  allIds,
  imageUriMap,
  onAddToAlbum,
  onCreateAlbum,
  onCancel,
  showSelectAll = true,
  onDeleted,
}: Props) {
  const {
    selectedIds,
    isSelecting,
    selectAll,
    clearAll,
    exitSelection,
    selectedArray,
  } =
    useSelectionStore();

  const slideAnim =
    useRef(
      new Animated.Value(
        100
      )
    ).current;

  const [
    isDeleting,
    setIsDeleting,
  ] = useState(false);

  const count =
    selectedIds.size;

  const allSelected =
    count ===
      allIds.length &&
    allIds.length >
      0;

  useEffect(() => {
    Animated.spring(
      slideAnim,
      {
        toValue:
          isSelecting
            ? 0
            : 100,
        useNativeDriver:
          true,
        damping: 22,
        stiffness:
          200,
      }
    ).start();
  }, [isSelecting]);

  if (
    !isSelecting
  ) {
    return null;
  }

  const handleSelectAll =
    () => {
      if (
        !showSelectAll
      ) {
        return;
      }

      if (
        allSelected
      ) {
        clearAll();
      } else {
        selectAll(
          allIds
        );
      }
    };

  const handleCancel =
    () => {
      exitSelection();
      onCancel();
    };

  const handleShare =
    async () => {
      const ids =
        selectedArray();

      if (
        ids.length === 0
      ) {
        return;
      }

      try {
        const uris = ids
          .map((id) => imageUriMap[id])
          .filter(
            (uri): uri is string =>
              !!uri
          );

        if (
          uris.length === 0
        ) {
          Alert.alert(
            "Error",
            "Image unavailable"
          );
          return;
        }

        await shareImages(
          uris
        );
      } catch (
        err
      ) {
        console.error(
          err
        );

        Alert.alert(
          "Error",
          "Could not share the selected images"
        );
      }
    };

  const handleDelete =
    () => {
      const ids =
        selectedArray();

      if (
        ids.length === 0
      ) {
        return;
      }

      Alert.alert(
        "Move selected images to Bin?",
        "The selected images will be moved to Bin. You can restore them later from the Bin.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Move to Bin",
            style: "destructive",
            onPress: async () => {
              setIsDeleting(true);

              try {
                await Promise.all(
                  ids.map((id) => deleteImage(id))
                );

                exitSelection();
                onDeleted?.(ids);
              } catch (err) {
                console.error(err);

                Alert.alert(
                  "Error",
                  "Could not move the selected images to Bin"
                );
              } finally {
                setIsDeleting(false);
              }
            },
          },
        ]
      );
    };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform:
            [
              {
                translateY:
                  slideAnim,
              },
            ],
        },
      ]}
    >
      <View
        style={
          styles.topRow
        }
      >
        <TouchableOpacity
          onPress={
            handleCancel
          }
          style={
            styles.cancelBtn
          }
        >
          <Text
            style={
              styles.cancelText
            }
          >
            ✕
          </Text>
        </TouchableOpacity>

        <Text
          style={
            styles.countText
          }
        >
          {count === 0
            ? "Select images"
            : `${count} selected`}
        </Text>

        <TouchableOpacity
          onPress={
            handleSelectAll
          }
          style={[
            styles.selectAllBtn,
            !showSelectAll &&
              styles.selectAllBtnHidden,
          ]}
          disabled={
            !showSelectAll
          }
          accessibilityElementsHidden={
            !showSelectAll
          }
          importantForAccessibility={
            showSelectAll
              ? "auto"
              : "no-hide-descendants"
          }
        >
          <Text
            style={[
              styles.selectAllText,
              allSelected &&
                styles.selectAllActive,
            ]}
          >
            {allSelected
              ? "Clear"
              : "All"}
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={
          styles.actions
        }
      >
        <TouchableOpacity
          style={[
            styles.actionBtn,
            count === 0 &&
              styles.actionBtnDisabled,
          ]}
          disabled={
            count === 0
          }
          onPress={() =>
            onAddToAlbum(
              selectedArray()
            )
          }
        >
          <Text
            style={
              styles.actionIcon
            }
          >
            ＋
          </Text>

          <Text
            style={
              styles.actionText
            }
          >
            Add to Album
          </Text>
        </TouchableOpacity>

        <View
          style={
            styles.actionDivider
          }
        />

        <TouchableOpacity
          style={[
            styles.actionBtn,
            count === 0 &&
              styles.actionBtnDisabled,
          ]}
          disabled={
            count === 0
          }
          onPress={
            handleShare
          }
        >
          <Text
            style={
              styles.actionIcon
            }
          >
            ↗
          </Text>

          <Text
            style={
              styles.actionText
            }
          >
            Share
          </Text>
        </TouchableOpacity>

        <View
          style={
            styles.actionDivider
          }
        />

        <TouchableOpacity
          style={[
            styles.actionBtn,
            count === 0 &&
              styles.actionBtnDisabled,
          ]}
          disabled={
            count === 0
          }
          onPress={() =>
            onCreateAlbum(
              selectedArray()
            )
          }
        >
          <Text
            style={
              styles.actionIcon
            }
          >
            ⊞
          </Text>

          <Text
            style={
              styles.actionText
            }
          >
            New Album
          </Text>
        </TouchableOpacity>

        <View
          style={
            styles.actionDivider
          }
        />

        <TouchableOpacity
          style={[
            styles.actionBtn,
            (count === 0 ||
              isDeleting) &&
              styles.actionBtnDisabled,
          ]}
          disabled={
            count === 0 ||
            isDeleting
          }
          onPress={
            handleDelete
          }
        >
          <Text
            style={[
              styles.actionIcon,
              styles.actionIconDestructive,
            ]}
          >
            🗑
          </Text>

          <Text
            style={[
              styles.actionText,
              styles.actionTextDestructive,
            ]}
          >
            Delete
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      position:
        "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor:
        colors.bg1,
      borderTopLeftRadius:
        radius.lg,
      borderTopRightRadius:
        radius.lg,
      paddingBottom:
        34,
      paddingTop:
        spacing.sm,
      paddingHorizontal:
        spacing.md,
      shadowColor:
        "#000",
      shadowOffset: {
        width: 0,
        height: -4,
      },
      shadowOpacity:
        0.4,
      shadowRadius:
        16,
      elevation: 20,
      borderTopWidth:
        1,
      borderTopColor:
        colors.bg3,
    },

    topRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      paddingVertical:
        spacing.sm,
    },

    cancelBtn: {
      width: 36,
      height: 36,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    cancelText: {
      color:
        colors.text1,
      fontSize: 16,
    },

    countText: {
      color:
        colors.text0,
      fontSize:
        font.md,
      fontWeight:
        font.semibold,
    },

    selectAllBtn: {
      paddingHorizontal:
        spacing.md,
      paddingVertical:
        spacing.xs,
      borderRadius:
        radius.full,
      backgroundColor:
        colors.bg2,
    },

    selectAllBtnHidden: {
      opacity: 0,
      backgroundColor: "transparent",
    },

    selectAllText: {
      color:
        colors.text1,
      fontSize:
        font.sm,
      fontWeight:
        font.medium,
    },

    selectAllActive: {
      color:
        colors.accent,
    },

    actions: {
      flexDirection:
        "row",
      alignItems:
        "center",
      paddingTop:
        spacing.xs,
      paddingBottom:
        spacing.sm,
      gap: 0,
    },

    actionBtn: {
      flex: 1,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingVertical:
        spacing.md,
      gap:
        spacing.sm,
      borderRadius:
        radius.md,
    },

    actionBtnDisabled: {
      opacity:
        0.35,
    },

    actionDivider: {
      width: 1,
      height: 32,
      backgroundColor:
        colors.bg3,
    },

    actionIcon: {
      color:
        colors.text0,
      fontSize: 18,
    },

    actionIconDestructive: {
      color:
        colors.error,
    },

    actionText: {
      color:
        colors.text0,
      fontSize:
        font.sm,
      fontWeight:
        font.medium,
    },

    actionTextDestructive: {
      color:
        colors.error,
    },
  });
