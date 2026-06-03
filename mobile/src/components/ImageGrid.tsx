/**
 * src/components/ImageGrid.tsx
 */

import React, {
  useCallback,
} from "react";

import {
  FlatList,
  View,
  Text,
  StyleSheet,
  Dimensions,
} from "react-native";

import {
  colors,
  spacing,
  radius,
} from "../utils/theme";

import SelectableImage from "./SelectableImage";

const SCREEN_W =
  Dimensions.get(
    "window"
  ).width;

interface GridImage {
  id: string;
  thumbnail_url: string;
  filename?: string;
}

interface Props {
  images: GridImage[];
  scores?: Record<string, number>;
  onPress?: (
    image: GridImage
  ) => void;
  onLongPress?: (
    image: GridImage
  ) => void;
  numColumns?: number;
  emptyText?: string;
  selectionContext?:
    | "chat"
    | "gallery"
    | "album";
}

export default function ImageGrid({
  images,
  scores,
  onPress,
  onLongPress,
  numColumns = 3,
  emptyText =
    "No images found",
  selectionContext,
}: Props) {
  const totalSpacing =
    spacing.sm *
    (numColumns + 1);

  const itemSize =
    (
      SCREEN_W -
      totalSpacing
    ) / numColumns;

  const hasScores =
    !!scores &&
    Object.keys(
      scores
    ).length > 0;

  const renderItem =
    useCallback(
      ({
        item,
      }: {
        item: GridImage;
      }) => {
        const score =
          scores?.[
            item.id
          ];

        return (
          <View
            style={[
              styles.cell,
              {
                width:
                  itemSize,
                height:
                  itemSize,
              },
            ]}
          >
            <SelectableImage
              id={item.id}
              thumbnailUrl={
                item.thumbnail_url
              }
              size={
                itemSize
              }
              score={
                score
              }
              hasScores={
                hasScores
              }
              selectionContext={
                selectionContext ??
                "gallery"
              }
              onLongPress={() =>
                onLongPress?.(
                  item
                )
              }
              onPress={() =>
                onPress?.(
                  item
                )
              }
            />

            {hasScores &&
              score !==
                undefined &&
              score >=
                0.35 && (
                <View
                  style={
                    styles.scoreBadge
                  }
                >
                  <Text
                    style={
                      styles.scoreText
                    }
                  >
                    {Math.round(
                      score *
                        100
                    )}
                  </Text>
                </View>
              )}
          </View>
        );
      },
      [
        scores,
        hasScores,
        itemSize,
        onPress,
        onLongPress,
        selectionContext,
      ]
    );

  if (
    images.length === 0
  ) {
    return (
      <View
        style={
          styles.empty
        }
      >
        <Text
          style={
            styles.emptyText
          }
        >
          {emptyText}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={images}
      renderItem={
        renderItem
      }
      keyExtractor={(
        item
      ) => item.id}
      numColumns={
        numColumns
      }
      contentContainerStyle={
        styles.grid
      }
      columnWrapperStyle={
        numColumns > 1
          ? styles.row
          : undefined
      }
      showsVerticalScrollIndicator={
        false
      }
    />
  );
}

const styles =
  StyleSheet.create({
    grid: {
      padding:
        spacing.sm,
      paddingBottom:
        120,
    },

    row: {
  justifyContent:
    "flex-start",
  gap:
    spacing.sm,
  marginBottom:
    spacing.sm,
},

    cell: {
      borderRadius:
        radius.sm,
      overflow:
        "hidden",
      backgroundColor:
        colors.bg2,
      position:
        "relative",
    },

    scoreBadge: {
      position:
        "absolute",
      bottom: 4,
      right: 4,
      backgroundColor:
        colors.accent,
      borderRadius:
        radius.full,
      paddingHorizontal:
        5,
      paddingVertical:
        1,
      zIndex: 5,
    },

    scoreText: {
      color:
        "#000",
      fontSize: 9,
      fontWeight:
        "700",
    },

    empty: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingVertical:
        60,
    },

    emptyText: {
      color:
        colors.text2,
      fontSize:
        14,
    },
  });