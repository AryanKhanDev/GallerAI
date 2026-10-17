/**
 * src/components/ImageGrid.tsx
 */

import React, {
  useCallback,
  useState,
  useRef,
} from "react";

import {
  FlatList,
  View,
  Text,
  StyleSheet,
  LayoutChangeEvent,
} from "react-native";

import {
  colors,
  spacing,
  radius,
} from "../utils/theme";

import SelectableImage from "./SelectableImage";

import { imageLayout } from "../utils/imageLayout";

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
  numColumns: requestedColumns,
  emptyText =
    "No images found",
  selectionContext,
}: Props) {
  const [width, setWidth] = useState(0);
  const firstVisibleIndex = useRef(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);
  const contentWidth = Math.max(1, width - spacing.sm * 2);
  const layout = imageLayout(contentWidth, spacing.sm, 100, 180);
  const numColumns = requestedColumns
    ? Math.max(1, Math.floor(requestedColumns))
    : layout.columns;
  const itemSize = requestedColumns
    ? Math.max(1, (contentWidth - spacing.sm * (numColumns - 1)) / numColumns)
    : layout.size;

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

  return (
    <View style={styles.container} onLayout={onLayout}>
      {images.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : width > 0 && (
        <FlatList
          key={numColumns}
          data={images}
          // FlatList virtualizes rows when numColumns > 1. Restore the row
          // containing the previously visible image after a column remount.
          initialScrollIndex={Math.floor(
            Math.min(firstVisibleIndex.current, images.length - 1) / numColumns
          )}
          getItemLayout={(_, index) => ({
            length: itemSize + spacing.sm,
            offset: spacing.sm + index * (itemSize + spacing.sm),
            index,
          })}
          onScroll={(event) => {
            const row = Math.floor(Math.max(0, event.nativeEvent.contentOffset.y - spacing.sm) / (itemSize + spacing.sm));
            firstVisibleIndex.current = row * numColumns;
          }}
          scrollEventThrottle={16}
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
      )}
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: { flex: 1, minWidth: 0 },

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
      marginBottom: spacing.sm,
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