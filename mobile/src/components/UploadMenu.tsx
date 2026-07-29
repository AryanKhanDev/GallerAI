/**
 * src/components/UploadMenu.tsx
 * Minimal roll-up menu shown above the composer's '+' button.
 * No card, border, or divider — just two floating rows.
 */

import React, { useEffect, useRef } from "react";
import { Animated, TouchableOpacity, Text, StyleSheet } from "react-native";
import { colors, spacing, font } from "../utils/theme";

interface Props {
  visible: boolean;
  onCamera: () => void;
  onUpload: () => void;
}

export default function UploadMenu({ visible, onCamera, onUpload }: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.wrap, { opacity: anim, transform: [{ translateY }] }]}
    >
      <TouchableOpacity style={styles.item} onPress={onCamera} activeOpacity={0.6}>
        <Text style={styles.icon}>📷</Text>
        <Text style={styles.label}>Camera</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.item} onPress={onUpload} activeOpacity={0.6}>
        <Text style={styles.icon}>🖼️</Text>
        <Text style={styles.label}>Upload</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    bottom: "100%",
    marginBottom: spacing.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 8,
  },
  icon: { fontSize: 18 },
  label: { color: colors.text0, fontSize: font.md, fontWeight: font.medium },
});