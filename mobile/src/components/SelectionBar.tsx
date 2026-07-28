/**
 * src/components/SelectionBar.tsx
 *
 * Floating bar that appears whenever selection mode is active.
 * Shared between Gallery, Albums, and Chat.
 */

import React, {
  useEffect,
  useRef,
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

interface Props {
  allIds: string[];

  imageUriMap: Record<
    string,
    string
  >;

  onAddToAlbum: (
    ids: string[]
  ) => void;

  onCreateAlbum: (
    ids: string[]
  ) => void;

  onCancel: () => void;
}

export default function SelectionBar({
  allIds,
  imageUriMap,
  onAddToAlbum,
  onCreateAlbum,
  onCancel,
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
          style={
            styles.selectAllBtn
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

    actionText: {
      color:
        colors.text0,
      fontSize:
        font.sm,
      fontWeight:
        font.medium,
    },
  });
