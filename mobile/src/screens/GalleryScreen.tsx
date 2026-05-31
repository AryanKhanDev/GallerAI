/**
 * src/screens/GalleryScreen.tsx
 */

import React, {
  useState,
  useEffect,
  useRef,
} from "react";

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import {
  Moon,
  Sun,
} from "lucide-react-native";

import {
  getColors,
  spacing,
  radius,
  font,
} from "../utils/theme";

import {
  useGalleryStore,
  useAlbumStore,
  useThemeStore,
} from "../store";

import {
  listImages,
  queryImages,
  listAlbums,
  createAlbum,
  deleteAlbum,
  getAlbum,
  GalleryImage,
  Album,
} from "../api/client";

import ImageActionSheet from "../components/ImageActionSheet";
import ImageGrid from "../components/ImageGrid";

type ViewMode =
  | "grid"
  | "albums";

export default function GalleryScreen() {
  const {
    images,
    tagScores,
    isLoadingGallery,
    isTagging,
    setImages,
    setActiveTag,
    setTagScores,
    setLoadingGallery,
    setTagging,
  } = useGalleryStore();

  const {
  removeAlbum,
  addAlbum,
  setAlbums,
  albums,
  } = useAlbumStore();

  const mode =
    useThemeStore(
      (s) => s.mode
    );

  const toggleTheme =
    useThemeStore(
      (s) =>
        s.toggleTheme
    );

  const colors =
    getColors(mode);

  const [
    viewMode,
    setViewMode,
  ] =
    useState<ViewMode>(
      "grid"
    );

  const [
    tagDraft,
    setTagDraft,
  ] = useState("");

  const [
    activeTags,
    setActiveTags,
  ] = useState<
    string[]
  >([]);

  const [
    selectedAlbum,
    setSelectedAlbum,
  ] =
    useState<
      Album | null
    >(null);

  const [
    albumImages,
    setAlbumImages,
  ] = useState<
    GalleryImage[]
  >([]);

  const [
    actionSheet,
    setActionSheet,
  ] = useState({
    visible: false,
    imageId:
      null as
        | string
        | null,
  });
  const [
    createModalVisible,
    setCreateModalVisible,
  ] = useState(false);

  const [
    albumNameDraft,
    setAlbumNameDraft,
  ] = useState("");

  const [
    pendingAlbumImageIds,
    setPendingAlbumImageIds,
  ] = useState<string[]>(
    []
  );
  function handleCreateAlbum(
      imageIds: string[] = []
    ) {
      setPendingAlbumImageIds(
        imageIds
      );

      setAlbumNameDraft(
        ""
      );

      setCreateModalVisible(
        true
      );
    }

    async function confirmCreateAlbum() {
      const trimmed =
        albumNameDraft.trim();

      if (!trimmed)
        return;

      try {
        const created =
          await createAlbum(
            trimmed,
            pendingAlbumImageIds,
            activeTags.length
              ? activeTags.join(
                  " "
                )
              : undefined
          );

        addAlbum(
          created
        );

        setCreateModalVisible(
          false
        );

        setAlbumNameDraft(
          ""
        );

        setPendingAlbumImageIds(
          []
        );

        Alert.alert(
          "Created",
          `"${created.name}" created`
        );
      } catch {
        Alert.alert(
          "Error",
          "Could not create album"
        );
      }
    }
  const tagDebounceRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  useEffect(() => {
    loadGallery();
    loadAlbums();
  }, []);

  async function loadGallery() {
    setLoadingGallery(
      true
    );

    try {
      const data =
        await listImages(
          500
        );

      setImages(
        data.images,
        data.total
      );
    } finally {
      setLoadingGallery(
        false
      );
    }
  }

  async function loadAlbums() {
    try {
      const data =
        await listAlbums();

      setAlbums(data);
    } catch {}
  }

  async function applyQuery(
  query: string
) {
  setTagging(true);
  setActiveTag(query);

  try {
    const result =
      await queryImages(
        query,
        200,
        "gallery"
      );

    const scores:
      Record<
        string,
        number
      > = {};

    result.results.forEach(
      (r) => {
        scores[
          r.id
        ] = r.score;
      }
    );

    // Soft semantic narrowing
    const combined:
      Record<
        string,
        number
      > = {};

    Object.entries(
      scores
    ).forEach(
      ([id, score]) => {
        const prior =
          tagScores[id];

        combined[id] =
          prior !== undefined
            ? Math.min(
                prior,
                score
              )
            : score;
      }
    );

    setTagScores(
      activeTags.length
        ? combined
        : scores
    );
  } finally {
    setTagging(
      false
    );
  }
}

  const handleDraftChange =
    (
      text: string
    ) => {
      setTagDraft(
        text
      );

      clearTimeout(
        tagDebounceRef.current!
      );

      const query = [
        ...activeTags,
        text.trim(),
      ]
        .filter(
          Boolean
        )
        .join(" ");

      if (
        !query.trim()
      ) {
        setActiveTag(
          ""
        );

        setTagScores(
          {}
        );

        return;
      }

      tagDebounceRef.current =
        setTimeout(
          () =>
            applyQuery(
              query
            ),
          300
        );
    };

  function addTag() {
    const tag =
      tagDraft.trim();

    if (!tag) {
      setTagDraft("");
      return;
    }

    if (
      activeTags.includes(
        tag
      )
    ) {
      setTagDraft("");
      return;
    }

    const next = [
      ...activeTags,
      tag,
    ];

    setActiveTags(
      next
    );

    setTagDraft("");

    applyQuery(
      next.join(" ")
    );
  }

  function removeTag(
    tag: string
  ) {
    const next =
      activeTags.filter(
        (t) =>
          t !== tag
      );

    setActiveTags(
      next
    );

    if (
      next.length === 0
    ) {
      setActiveTag(
        ""
      );

      setTagScores(
        {}
      );

      return;
    }

    applyQuery(
      next.join(" ")
    );
  }
    const sortedImages =
    React.useMemo(
      () => {
        if (
          !Object.keys(
            tagScores
          ).length
        ) {
          return images;
        }

        return [
          ...images,
        ].sort(
          (
            a,
            b
          ) =>
            (tagScores[
              b.id
            ] ??
              0) -
            (tagScores[
              a.id
            ] ??
              0)
        );
      },
      [
        images,
        tagScores,
      ]
    );

  async function openAlbum(
    album: Album
  ) {
    setSelectedAlbum(
      album
    );

    try {
      const full =
        await getAlbum(
          album.id
        );

      const idSet =
        new Set(
          full.image_ids
        );

      const matched =
        images.filter(
          (img) =>
            idSet.has(
              img.id
            )
        );

      const ordered =
        full.image_ids
          .map((id) =>
            matched.find(
              (img) =>
                img.id ===
                id
            )
          )
          .filter(
            Boolean
          ) as GalleryImage[];

      setAlbumImages(
        ordered
      );
    } catch {
      Alert.alert(
        "Error",
        "Could not load album"
      );
    }
  }

  async function handleDeleteAlbum(
    album: Album
  ) {
    Alert.alert(
      `Delete "${album.name}"?`,
      "This removes the album, not the photos.",
      [
        {
          text: "Cancel",
          style:
            "cancel",
        },
        {
          text: "Delete",
          style:
            "destructive",
          onPress:
            async () => {
              try {
                await deleteAlbum(
                  album.id
                );

                removeAlbum(
                  album.id
                );

                if (
                  selectedAlbum?.id ===
                  album.id
                ) {
                  setSelectedAlbum(
                    null
                  );
                }
              } catch {
                Alert.alert(
                  "Error",
                  "Could not delete album"
                );
              }
            },
        },
      ]
    );
  }
  
  
  return (
    <SafeAreaView
      style={[
        styles.root,
        {
          backgroundColor:
            colors.bg0,
        },
      ]}
      edges={["top"]}
    >
      {/* Header */}
      <View
        style={
          styles.header
        }
      >
        <Pressable
          onPress={() =>
            selectedAlbum
              ? setSelectedAlbum(
              null): toggleTheme()
          }
          style={
            styles.logoWrap
          }
        >
          <Text
            style={[
              styles.headerTitle,
              {
                color:
                  colors.text0,
              },
            ]}
          >
            {selectedAlbum
              ? `← ${selectedAlbum.name}`
              : "GallerAI"}
          </Text>

          {!selectedAlbum &&
            (mode ===
            "dark" ? (
              <Moon
                size={15}
                color={
                  colors.text1
                }
              />
            ) : (
              <Sun
                size={15}
                color={
                  colors.text1
                }
              />
            ))}
        </Pressable>

        {!selectedAlbum && (
          <View
            style={[
              styles.toggle,
              {
                backgroundColor:
                  colors.bg2,
              },
            ]}
          >
            {(
              [
                "grid",
                "albums",
              ] as ViewMode[]
            ).map(
              (
                modeItem
              ) => (
                <TouchableOpacity
                  key={
                    modeItem
                  }
                  style={[
                    styles.toggleBtn,
                    viewMode ===
                      modeItem && {
                      backgroundColor:
                        colors.bg1,
                    },
                  ]}
                  onPress={() =>
                    setViewMode(
                      modeItem
                    )
                  }
                >
                  <Text
                    style={[
                      styles.toggleText,
                      {
                        color:
                          viewMode ===
                          modeItem
                            ? colors.text0
                            : colors.text2,
                      },
                    ]}
                  >
                    {modeItem ===
                    "grid"
                      ? "Photos"
                      : "Albums"}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        )}
      </View>

      {/* Floating tags */}
      {viewMode ===
        "grid" &&
        !selectedAlbum && (
          <View
            style={
              styles.tagsRow
            }
          >
            {activeTags.map(
              (tag) => (
                <View
                  key={tag}
                  style={[
                    styles.tagChip,
                    {
                      backgroundColor:
                        colors.bg1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tagChipText,
                      {
                        color:
                          colors.text0,
                      },
                    ]}
                  >
                    {tag}
                  </Text>

                  <TouchableOpacity
                    onPress={() =>
                      removeTag(
                        tag
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.tagChipClose,
                        {
                          color:
                            colors.text2,
                        },
                      ]}
                    >
                      ×
                    </Text>
                  </TouchableOpacity>
                </View>
              )
            )}

            {tagDraft ===
            "" ? (
              <TouchableOpacity
                style={[
                  styles.addChip,
                  {
                    borderColor:
                      colors.bg2,
                  },
                ]}
                onPress={() =>
                  setTagDraft(
                    " "
                  )
                }
              >
                <Text
                  style={[
                    styles.addChipText,
                    {
                      color:
                        colors.text2,
                    },
                  ]}
                >
                  Add tag +
                </Text>
              </TouchableOpacity>
            ) : (
              <TextInput
                autoFocus
                style={[
                  styles.inlineInput,
                  {
                    color:
                      colors.text0,
                    backgroundColor:
                      colors.bg1,
                  },
                ]}
                value={
                  tagDraft
                }
                onChangeText={
                  handleDraftChange
                }
                onSubmitEditing={
                  addTag
                }
                onBlur={() =>
                  setTagDraft(
                    ""
                  )
                }
                placeholder="tag"
                placeholderTextColor={
                  colors.text2
                }
                returnKeyType="done"
              />
            )}

            {isTagging && (
              <ActivityIndicator
                size="small"
                color={
                  colors.text1
                }
              />
            )}
          </View>
        )}

      {/* Grid */}
      {viewMode === "grid" ? (
          isLoadingGallery ? (
            <View
              style={styles.center}
            >
              <ActivityIndicator
                color={
                  colors.text1
                }
              />
            </View>
          ) : selectedAlbum ? (
            <ImageGrid
              images={
                albumImages
              }
              onLongPress={(
                img
              ) =>
                Alert.alert(
                  "Remove image?",
                  `Remove from ${selectedAlbum.name}?`,
                  [
                    {
                      text: "Cancel",
                      style:
                        "cancel",
                    },
                  ]
                )
              }
              emptyText="Album is empty"
            />
          ) : (
            <ImageGrid
              images={
                sortedImages
              }
              scores={
                Object.keys(
                  tagScores
                ).length
                  ? tagScores
                  : undefined
              }
              onLongPress={(
                img
              ) =>
                setActionSheet(
                  {
                    visible:
                      true,
                    imageId:
                      img.id,
                  }
                )
              }
              emptyText="No images indexed yet"
            />
          )
        ) : (
          
          selectedAlbum ? (
        <ImageGrid
          images={
            albumImages
          }
          emptyText="Album is empty"
          onLongPress={(
            img
          ) =>
            Alert.alert(
              "Remove image?",
              `Remove from ${selectedAlbum!.name}?`,
              [
                {
                  text: "Cancel",
                  style:
                    "cancel",
                },
              ]
            )
          }
        />
      ) : (
        <View
          style={
            styles.albumsWrap
          }
        >
          {albums.length ===
          0 ? (
            <View
              style={
                styles.emptyAlbums
              }
            >
              <Text
                style={[
                  styles.emptyAlbumsText,
                  {
                    color:
                      colors.text2,
                  },
                ]}
              >
                No albums yet
              </Text>

              <TouchableOpacity
                style={[
                  styles.createBtn,
                  {
                    backgroundColor:
                      colors.bg1,
                  },
                ]}
                onPress={() =>
                  handleCreateAlbum()
                }
              >
                <Text
                  style={[
                    styles.createBtnText,
                    {
                      color:
                        colors.text0,
                    },
                  ]}
                >
                  + Create Album
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.createBtn,
                  {
                    backgroundColor:
                      colors.bg1,
                  },
                ]}
                onPress={() =>
                  handleCreateAlbum()
                }
              >
                <Text
                  style={[
                    styles.createBtnText,
                    {
                      color:
                        colors.text0,
                    },
                  ]}
                >
                  + Create Album
                </Text>
              </TouchableOpacity>

              {albums.map(
                (
                  album
                ) => (
                  <TouchableOpacity
                    key={
                      album.id
                    }
                    style={[
                      styles.albumCard,
                      {
                        backgroundColor:
                          colors.bg1,
                      },
                    ]}
                    onPress={() =>
                      openAlbum(
                        album
                      )
                    }
                    onLongPress={() =>
                      handleDeleteAlbum(
                        album
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.albumName,
                        {
                          color:
                            colors.text0,
                        },
                      ]}
                    >
                      {album.name}
                    </Text>

                    <Text
                      style={[
                        styles.albumCount,
                        {
                          color:
                            colors.text2,
                        },
                      ]}
                    >
                      {
                        album.image_ids
                          .length
                      }{" "}
                      photos
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </>
          )}
        </View>
      )
          
    )}
      <Modal
          visible={
            createModalVisible
          }
          transparent
          animationType="fade"
        >
          <View
            style={[
              styles.modalOverlay,
              {
                backgroundColor:
                  colors.overlay,
              },
            ]}
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor:
                    colors.bg1,
                },
              ]}
            >
              <Text
                style={[
                  styles.modalTitle,
                  {
                    color:
                      colors.text0,
                  },
                ]}
              >
                Create Album
              </Text>

              <TextInput
                value={
                  albumNameDraft
                }
                onChangeText={
                  setAlbumNameDraft
                }
                placeholder="Album name"
                placeholderTextColor={
                  colors.text2
                }
                style={[
                  styles.modalInput,
                  {
                    color:
                      colors.text0,
                    backgroundColor:
                      colors.bg2,
                  },
                ]}
                autoFocus
              />

              <View
                style={
                  styles.modalActions
                }
              >
                <TouchableOpacity
                  onPress={() =>
                    setCreateModalVisible(
                      false
                    )
                  }
                >
                  <Text
                    style={[
                      styles.modalCancel,
                      {
                        color:
                          colors.text2,
                      },
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={
                    confirmCreateAlbum
                  }
                >
                  <Text
                    style={[
                      styles.modalCreate,
                      {
                        color:
                          colors.text0,
                      },
                    ]}
                  >
                    Create
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      <ImageActionSheet
        visible={
          actionSheet.visible
        }
        imageId={
          actionSheet.imageId
        }
        onClose={() =>
          setActionSheet(
            {
              visible:
                false,
              imageId:
                null,
            }
          )
        }
      />
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    root: {
      flex: 1,
    },

    header: {
      flexDirection:
        "row",
      justifyContent:
        "space-between",
      alignItems:
        "center",
      paddingHorizontal:
        spacing.md,
      paddingVertical:
        spacing.sm,
    },

    logoWrap: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 6,
    },

    headerTitle: {
      fontSize:
        font.lg,
      fontWeight:
        font.semibold,
    },

    toggle: {
      flexDirection:
        "row",
      borderRadius:
        radius.full,
      padding: 2,
    },

    toggleBtn: {
      paddingHorizontal:
        spacing.md,
      paddingVertical: 6,
      borderRadius:
        radius.full,
    },

    toggleText: {
      fontSize:
        font.sm,
    },

    tagsRow: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      alignItems:
        "center",
      paddingHorizontal:
        spacing.md,
      paddingBottom:
        spacing.sm,
    },

    tagChip: {
      flexDirection:
        "row",
      alignItems:
        "center",
      borderRadius:
        radius.full,
      paddingHorizontal:
        14,
      paddingVertical:
        8,
      marginRight:
        spacing.sm,
      marginBottom:
        spacing.sm,
    },

    tagChipText: {
      fontSize: font.sm,
      lineHeight: font.sm,
    },

    tagChipClose: {
      marginLeft: 8,
      fontSize: 13,
      lineHeight: 13,
      textAlignVertical: "center",
    },

    addChip: {
      height: 34,
      paddingHorizontal: 12,
      borderRadius: 17,
      borderWidth: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginBottom:
        spacing.sm,
    },

    addChipText: {
      fontSize: 12,
      marginTop: -2,
    },

    inlineInput: {
      minWidth: 80,
      fontSize:
        font.sm,
      borderRadius:
        radius.full,
      paddingHorizontal:
        14,
      paddingVertical:
        6,
      marginBottom:
        spacing.sm,
    },

    center: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    albumsWrap: {
      flex: 1,
      padding: spacing.md,
    },

    emptyAlbums: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      gap: spacing.md,
    },

    emptyAlbumsText: {
      fontSize:
        font.md,
    },

    createBtn: {
      paddingVertical: 14,
      borderRadius:
        radius.md,
      alignItems:
        "center",
      marginBottom:
        spacing.md,
    },

    createBtnText: {
      fontSize:
        font.md,
      fontWeight:
        font.medium,
    },

    albumCard: {
      padding:
        spacing.md,
      borderRadius:
        radius.md,
      marginBottom:
        spacing.sm,
    },

    albumName: {
      fontSize:
        font.md,
      fontWeight:
        font.semibold,
    },

    albumCount: {
      marginTop: 4,
      fontSize:
        font.sm,
    },

    modalOverlay: {
      flex: 1,
      justifyContent:
        "center",
      alignItems:
        "center",
      padding:
        spacing.lg,
    },

    modalCard: {
      width: "100%",
      borderRadius:
        radius.lg,
      padding:
        spacing.lg,
    },

    modalTitle: {
      fontSize:
        font.lg,
      fontWeight:
        font.semibold,
      marginBottom:
        spacing.md,
    },

    modalInput: {
      borderRadius:
        radius.md,
      padding:
        spacing.md,
      fontSize:
        font.md,
    },

    modalActions: {
      flexDirection:
        "row",
      justifyContent:
        "flex-end",
      marginTop:
        spacing.lg,
      gap:
        spacing.lg,
    },

    modalCancel: {
      fontSize:
        font.md,
    },

    modalCreate: {
      fontSize:
        font.md,
      fontWeight:
        font.semibold,
    },
});