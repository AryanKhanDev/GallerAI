/**
 * src/components/AlbumPickerModal.tsx
 *
 * Modal shown when user taps Add to Album / New Album.
 * Mode:
 *  - "pick"   → existing albums
 *  - "create" → create new album
 */

import React, {
  useState,
} from "react";

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
  ActivityIndicator,
} from "react-native";

import {
  colors,
  spacing,
  radius,
  font,
} from "../utils/theme";

import {
  useAlbumStore,
  useSelectionStore,
} from "../store";

import {
  addToAlbum,
  createAlbum,
} from "../api/client";

export type AlbumPickerMode =
  | "pick"
  | "create"
  | null;

interface Props {
  mode:
    AlbumPickerMode;

  imageIds:
    string[];

  onClose:
    () => void;
}

export default function AlbumPickerModal({
  mode,
  imageIds,
  onClose,
}: Props) {
  const {
    albums,
    addAlbum,
  } =
    useAlbumStore();

  const {
    exitSelection,
  } =
    useSelectionStore();

  // The Bin is a system album, not a user album — it must never be
  // offered as an add-to-album / new-album target.
  const pickableAlbums = albums.filter(
    (a) => !a.is_system
  );

  const [
    newName,
    setNewName,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(
    false
  );

  const visible =
    mode !== null;

  async function handlePickAlbum(
    albumId: string,
    albumName: string
  ) {
    if (
      !imageIds.length
    ) {
      return;
    }

    setLoading(
      true
    );

    try {
      await addToAlbum(
        albumId,
        imageIds
      );

      exitSelection();

      handleClose();

      Alert.alert(
        "Added",
        `${imageIds.length} image${
          imageIds.length >
          1
            ? "s"
            : ""
        } added to "${albumName}".`
      );
    } catch {
      Alert.alert(
        "Error",
        "Could not add to album."
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  async function handleCreate() {
    if (
      !newName.trim() ||
      !imageIds.length
    ) {
      return;
    }

    setLoading(
      true
    );

    try {
      const album =
        await createAlbum(
          newName.trim(),
          imageIds
        );

      addAlbum(
        album
      );

      exitSelection();

      handleClose();

      Alert.alert(
        "Created",
        `Album "${newName.trim()}" created with ${imageIds.length} image${
          imageIds.length >
          1
            ? "s"
            : ""
        }.`
      );
    } catch {
      Alert.alert(
        "Error",
        "Could not create album."
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  function handleClose() {
    setNewName(
      ""
    );

    onClose();
  }

  return (
    <Modal
      visible={
        visible
      }
      transparent
      animationType="slide"
      onRequestClose={
        handleClose
      }
    >
      <TouchableWithoutFeedback
        onPress={
          handleClose
        }
      >
        <View
          style={
            styles.backdrop
          }
        />
      </TouchableWithoutFeedback>

      <View
        style={
          styles.sheet
        }
      >
        <View
          style={
            styles.handle
          }
        />

        {mode ===
        "pick" ? (
          <>
            <Text
              style={
                styles.title
              }
            >
              Add to Album
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              {imageIds.length} image
              {imageIds.length >
              1
                ? "s"
                : ""}{" "}
              selected
            </Text>

            {pickableAlbums.length ===
            0 ? (
              <View
                style={
                  styles.emptyAlbums
                }
              >
                <Text
                  style={
                    styles.emptyText
                  }
                >
                  No albums yet.
                </Text>

                <Text
                  style={
                    styles.emptyHint
                  }
                >
                  Create one first.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={
                  styles.list
                }
                showsVerticalScrollIndicator={
                  false
                }
              >
                {pickableAlbums.map(
                  (
                    album
                  ) => (
                    <TouchableOpacity
                      key={
                        album.id
                      }
                      style={
                        styles.albumRow
                      }
                      onPress={() =>
                        handlePickAlbum(
                          album.id,
                          album.name
                        )
                      }
                      disabled={
                        loading
                      }
                    >
                      <View
                        style={
                          styles.albumInfo
                        }
                      >
                        <Text
                          style={
                            styles.albumName
                          }
                        >
                          {
                            album.name
                          }
                        </Text>

                        <Text
                          style={
                            styles.albumCount
                          }
                        >
                          {
                            album
                              .image_ids
                              .length
                          }{" "}
                          photo
                          {album
                            .image_ids
                            .length !==
                          1
                            ? "s"
                            : ""}
                        </Text>
                      </View>

                      <Text
                        style={
                          styles.albumArrow
                        }
                      >
                        ›
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </ScrollView>
            )}

            {loading && (
              <View
                style={
                  styles.loadingRow
                }
              >
                <ActivityIndicator
                  color={
                    colors.text1
                  }
                />
              </View>
            )}
          </>
        ) : (
          <>
            <Text
              style={
                styles.title
              }
            >
              New Album
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              {imageIds.length} image
              {imageIds.length >
              1
                ? "s"
                : ""}{" "}
              will be added
            </Text>

            <TextInput
              style={
                styles.input
              }
              placeholder="Album name"
              placeholderTextColor={
                colors.text2
              }
              value={
                newName
              }
              onChangeText={
                setNewName
              }
              autoFocus
              returnKeyType="done"
              onSubmitEditing={
                handleCreate
              }
            />

            <View
              style={
                styles.formRow
              }
            >
              <TouchableOpacity
                style={
                  styles.cancelBtn
                }
                onPress={
                  handleClose
                }
              >
                <Text
                  style={
                    styles.cancelText
                  }
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.createBtn,
                  (!newName.trim() ||
                    loading) &&
                    styles.createBtnDisabled,
                ]}
                onPress={
                  handleCreate
                }
                disabled={
                  !newName.trim() ||
                  loading
                }
              >
                {loading ? (
                  <ActivityIndicator
                    color="#000"
                    size="small"
                  />
                ) : (
                  <Text
                    style={
                      styles.createText
                    }
                  >
                    Create
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles =
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor:
        "rgba(0,0,0,0.62)",
    },

    sheet: {
      backgroundColor:
        colors.bg1,
      borderTopLeftRadius:
        radius.lg,
      borderTopRightRadius:
        radius.lg,
      paddingHorizontal:
        spacing.lg,
      paddingBottom:
        44,
      maxHeight:
        "65%",
    },

    handle: {
      width: 36,
      height: 4,
      backgroundColor:
        colors.bg3,
      borderRadius:
        radius.full,
      alignSelf:
        "center",
      marginTop:
        spacing.md,
      marginBottom:
        spacing.sm,
    },

    title: {
      color:
        colors.text0,
      fontSize:
        font.lg,
      fontWeight:
        font.semibold,
      marginBottom:
        4,
    },

    subtitle: {
      color:
        colors.text2,
      fontSize:
        font.sm,
      marginBottom:
        spacing.md,
    },

    list: {
      maxHeight:
        280,
    },

    albumRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      paddingVertical:
        spacing.md,
      borderBottomWidth:
        StyleSheet.hairlineWidth,
      borderBottomColor:
        colors.bg3,
    },

    albumInfo: {
      flex: 1,
    },

    albumName: {
      color:
        colors.text0,
      fontSize:
        font.md,
      fontWeight:
        font.medium,
    },

    albumCount: {
      color:
        colors.text2,
      fontSize:
        font.sm,
      marginTop:
        2,
    },

    albumArrow: {
      color:
        colors.text2,
      fontSize:
        22,
      fontWeight:
        "300",
    },

    emptyAlbums: {
      paddingVertical:
        spacing.xl,
      alignItems:
        "center",
    },

    emptyText: {
      color:
        colors.text1,
      fontSize:
        font.md,
    },

    emptyHint: {
      color:
        colors.text2,
      fontSize:
        font.sm,
      marginTop:
        4,
    },

    loadingRow: {
      paddingVertical:
        spacing.md,
      alignItems:
        "center",
    },

    input: {
      backgroundColor:
        colors.bg2,
      color:
        colors.text0,
      borderRadius:
        radius.md,
      padding:
        spacing.md,
      fontSize:
        font.md,
      borderWidth:
        1,
      borderColor:
        colors.bg3,
      marginBottom:
        spacing.md,
    },

    formRow: {
      flexDirection:
        "row",
      gap:
        spacing.sm,
    },

    cancelBtn: {
      flex: 1,
      padding:
        spacing.md,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.bg2,
      alignItems:
        "center",
    },

    cancelText: {
      color:
        colors.text1,
      fontSize:
        font.md,
    },

    createBtn: {
      flex: 1,
      padding:
        spacing.md,
      borderRadius:
        radius.md,
      backgroundColor:
        colors.accent,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    createBtnDisabled: {
      opacity:
        0.4,
    },

    createText: {
      color:
        "#000",
      fontSize:
        font.md,
      fontWeight:
        font.semibold,
    },
  });