/**
 * src/components/ImageGrid.tsx
 * Masonry-style image grid used in both Chat results and Gallery.
 *
 * Props:
 *   images       — list of images with id + thumbnail_url
 *   scores       — optional map of id→score for tag dimming (0–1)
 *   onPress      — tap handler
 *   onLongPress  — long press handler (action sheet trigger)
 *   numColumns   — default 3
 */

import React, { useCallback } from "react";
import {
  FlatList,
  TouchableOpacity,
  Image,
  View,
  Text,
  StyleSheet,
  Dimensions,
} from "react-native";
import { colors, spacing, radius } from "../utils/theme";
import { BASE_URL } from "../api/client";

const SCREEN_W = Dimensions.get("window").width;

interface GridImage {
  id: string;
  thumbnail_url: string;
  filename?: string;
}

interface Props {
  images: GridImage[];
  scores?: Record<string, number>;
  onPress?: (image: GridImage) => void;
  onLongPress?: (image: GridImage) => void;
  numColumns?: number;
  emptyText?: string;
}

export default function ImageGrid({
  images,
  scores,
  onPress,
  onLongPress,
  numColumns = 3,
  emptyText = "No images found",
}: Props) {
  const totalSpacing =
    spacing.sm * (numColumns + 1);

  const itemSize =
    (SCREEN_W - totalSpacing) /
    numColumns;

  const hasScores =
    !!scores &&
    Object.keys(scores).length > 0;

  const renderItem = useCallback(
    ({ item }: { item: GridImage }) => {
      const score =
        scores?.[item.id];

      // Dim low relevance images
      const opacity =
        hasScores &&
        score !== undefined
          ? score < 0.2
            ? 0.08
            : score < 0.35
            ? 0.3
            : 1
          : 1;

      const uri =
        item.thumbnail_url.startsWith(
          "http"
        )
          ? item.thumbnail_url
          : `${BASE_URL}${item.thumbnail_url}`;

      return (
        <TouchableOpacity
          onPress={() =>
            onPress?.(item)
          }
          onLongPress={() =>
            onLongPress?.(item)
          }
          activeOpacity={0.8}
          style={[
            styles.cell,
            {
              width: itemSize,
              height: itemSize,
              opacity,
            },
          ]}
        >
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="cover"
          />

          {/* Score badge */}
          {hasScores &&
            score !==
              undefined &&
            score >= 0.35 && (
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
                    score * 100
                  )}
                </Text>
              </View>
            )}
        </TouchableOpacity>
      );
    },
    [
      scores,
      hasScores,
      itemSize,
      onPress,
      onLongPress,
    ]
  );

  if (images.length === 0) {
    return (
      <View style={styles.empty}>
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
      renderItem={renderItem}
      keyExtractor={(item) =>
        item.id
      }
      numColumns={numColumns}
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
      padding: spacing.sm,
      paddingBottom: 120,
    },

    // FIX: removed gap for RN Web
    row: {
      justifyContent:
        "space-between",
      marginBottom:
        spacing.sm,
    },

    cell: {
      borderRadius:
        radius.sm,
      overflow: "hidden",
      backgroundColor:
        colors.bg2,
    },

    image: {
      width: "100%",
      height: "100%",
    },

    scoreBadge: {
      position: "absolute",
      bottom: 4,
      right: 4,
      backgroundColor:
        colors.accent,
      borderRadius:
        radius.full,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },

    scoreText: {
      color: "#000",
      fontSize: 9,
      fontWeight: "700",
    },

    empty: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingVertical: 60,
    },

    emptyText: {
      color:
        colors.text2,
      fontSize: 14,
    },
  });