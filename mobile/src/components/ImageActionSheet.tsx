/**
 * src/components/ImageActionSheet.tsx
 * Bottom action sheet shown on long-press of any image.
 * Options: view full, add to album, create album, copy path.
 */

import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { colors, spacing, radius, font } from "../utils/theme";
import { useAlbumStore } from "../store";
import { addToAlbum, createAlbum } from "../api/client";

interface Props {
  visible: boolean;
  imageId: string | null;
  imageIds?: string[];          // if multiple selected
  onClose: () => void;
  onViewFull?: () => void;
}

export default function ImageActionSheet({
  visible,
  imageId,
  imageIds,
  onClose,
  onViewFull,
}: Props) {
  const { albums, addAlbum } = useAlbumStore();
  const [showNewAlbum, setShowNewAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [loading, setLoading] = useState(false);

  const targetIds = imageIds?.length
    ? imageIds
    : imageId
    ? [imageId]
    : [];

  async function handleAddToAlbum(albumId: string) {
    if (!targetIds.length) return;
    setLoading(true);
    try {
      await addToAlbum(albumId, targetIds);
      onClose();
    } catch {
      Alert.alert("Error", "Could not add to album");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAlbum() {
    if (!newAlbumName.trim() || !targetIds.length) return;
    setLoading(true);
    try {
      const album = await createAlbum(newAlbumName.trim(), targetIds);
      addAlbum(album);
      setNewAlbumName("");
      setShowNewAlbum(false);
      onClose();
    } catch {
      Alert.alert("Error", "Could not create album");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setShowNewAlbum(false);
    setNewAlbumName("");
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={reset}
    >
      <TouchableWithoutFeedback onPress={reset}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        <Text style={styles.title}>
          {targetIds.length > 1
            ? `${targetIds.length} images`
            : "Image"}
        </Text>

        {/* Actions */}
        {onViewFull && !imageIds?.length && (
          <TouchableOpacity
            style={styles.action}
            onPress={() => { onViewFull(); onClose(); }}
          >
            <Text style={styles.actionText}>View full size</Text>
          </TouchableOpacity>
        )}

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>ADD TO ALBUM</Text>

        {!showNewAlbum ? (
          <>
            <ScrollView style={styles.albumList} showsVerticalScrollIndicator={false}>
              {albums.map((album) => (
                <TouchableOpacity
                  key={album.id}
                  style={styles.albumRow}
                  onPress={() => handleAddToAlbum(album.id)}
                  disabled={loading}
                >
                  <Text style={styles.albumName}>{album.name}</Text>
                  <Text style={styles.albumCount}>
                    {album.image_ids.length} photos
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.newAlbumBtn}
              onPress={() => setShowNewAlbum(true)}
            >
              <Text style={styles.newAlbumText}>+ Create new album</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.newAlbumForm}>
            <TextInput
              style={styles.input}
              placeholder="Album name"
              placeholderTextColor={colors.text2}
              value={newAlbumName}
              onChangeText={setNewAlbumName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateAlbum}
            />
            <View style={styles.formRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowNewAlbum(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.createBtn,
                  !newAlbumName.trim() && styles.createBtnDisabled,
                ]}
                onPress={handleCreateAlbum}
                disabled={!newAlbumName.trim() || loading}
              >
                <Text style={styles.createText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: colors.bg1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
    maxHeight: "70%",
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
    color: colors.text1,
    fontSize: font.sm,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  action: {
    paddingVertical: spacing.md,
  },
  actionText: {
    color: colors.text0,
    fontSize: font.md,
    fontWeight: font.medium,
  },
  divider: {
    height: 1,
    backgroundColor: colors.bg3,
    marginVertical: spacing.sm,
  },
  sectionLabel: {
    color: colors.text2,
    fontSize: font.xs,
    fontWeight: font.semibold,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  albumList: {
    maxHeight: 200,
  },
  albumRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.bg3,
  },
  albumName: {
    color: colors.text0,
    fontSize: font.md,
  },
  albumCount: {
    color: colors.text2,
    fontSize: font.sm,
  },
  newAlbumBtn: {
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  newAlbumText: {
    color: colors.accent,
    fontSize: font.md,
    fontWeight: font.medium,
  },
  newAlbumForm: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.bg2,
    color: colors.text0,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.md,
    borderWidth: 1,
    borderColor: colors.bg3,
  },
  formRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg2,
    alignItems: "center",
  },
  cancelText: {
    color: colors.text1,
    fontSize: font.md,
  },
  createBtn: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
  },
  createBtnDisabled: {
    opacity: 0.4,
  },
  createText: {
    color: "#000",
    fontSize: font.md,
    fontWeight: font.semibold,
  },
});
