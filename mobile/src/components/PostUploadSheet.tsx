/**
 * src/components/PostUploadSheet.tsx
 * Shown right after an upload finishes. The photo is already in the
 * Gallery at this point — this is purely an optional album assignment,
 * so "Skip" is always available.
 */

import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from "react-native";
import { colors, spacing, radius, font } from "../utils/theme";
import { AlbumPickerMode } from "./AlbumPickerModal";

interface Props {
  visible: boolean;
  onChoose: (mode: Exclude<AlbumPickerMode, null>) => void;
  onSkip: () => void;
}

export default function PostUploadSheet({ visible, onChoose, onSkip }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <TouchableWithoutFeedback onPress={onSkip}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Photo added to Gallery</Text>
        <Text style={styles.subtitle}>Add it to an album?</Text>

        <TouchableOpacity style={styles.option} onPress={() => onChoose("pick")}>
          <Text style={styles.optionText}>Add to Existing Album</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.option} onPress={() => onChoose("create")}>
          <Text style={styles.optionText}>Create New Album</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.62)" },
  sheet: {
    backgroundColor: colors.bg1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: 44,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.bg3,
    borderRadius: radius.full,
    alignSelf: "center",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text0,
    fontSize: font.lg,
    fontWeight: font.semibold,
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    color: colors.text2,
    fontSize: font.sm,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  option: {
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.bg3,
    alignItems: "center",
  },
  optionText: {
    color: colors.accent,
    fontSize: font.md,
    fontWeight: font.medium,
  },
  skipBtn: {
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    alignItems: "center",
  },
  skipText: { color: colors.text2, fontSize: font.md },
});