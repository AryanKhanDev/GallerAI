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
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import {
  colors,
  spacing,
  radius,
  font,
} from "../utils/theme";

import {
  useGalleryStore,
  useAlbumStore,
} from "../store";

import {
  listImages,
  queryImages,
  listAlbums,
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
    setAlbums,
  } = useAlbumStore();

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
  ] = useState<string[]>(
    []
  );

  const [
    selectedAlbum,
    setSelectedAlbum,
  ] =
    useState<Album | null>(
      null
    );

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
    imageId: null as string | null,
  });

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
          200
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

      setTagScores(
        scores
      );
    } finally {
      setTagging(false);
    }
  }
  const handleDraftChange = (
  text: string
) => {
  setTagDraft(text);

  clearTimeout(
    tagDebounceRef.current!
  );

  const query = [
    ...activeTags,
    text.trim(),
  ]
    .filter(Boolean)
    .join(" ");

  if (!query.trim()) {
    setActiveTag("");
    setTagScores({});
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
      setActiveTag("");
      setTagScores({});
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
      style={styles.root}
      edges={["top"]}
    >
      {/* Header */}
      <View
        style={
          styles.header
        }
      >
        <Text
          style={
            styles.headerTitle
          }
        >
          {selectedAlbum
            ? selectedAlbum.name
            : "Gallery"}
        </Text>

        {!selectedAlbum && (
          <View
            style={
              styles.toggle
            }
          >
            {(
              [
                "grid",
                "albums",
              ] as ViewMode[]
            ).map(
              (
                mode
              ) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.toggleBtn,
                    viewMode ===
                      mode &&
                      styles.toggleActive,
                  ]}
                  onPress={() =>
                    setViewMode(
                      mode
                    )
                  }
                >
                  <Text
                    style={[
                      styles.toggleText,
                      viewMode ===
                        mode &&
                        styles.toggleTextActive,
                    ]}
                  >
                    {mode ===
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
                  style={
                    styles.tagChip
                  }
                >
                  <Text
                    style={
                      styles.tagChipText
                    }
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
                      style={
                        styles.tagChipClose
                      }
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
                style={
                  styles.addChip
                }
                onPress={() =>
                  setTagDraft(
                    " "
                  )
                }
              >
                <Text
                  style={
                    styles.addChipText
                  }
                >
                  +
                </Text>
              </TouchableOpacity>
            ) : (
              <TextInput
                autoFocus
                style={
                  styles.inlineInput
                }
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
      {viewMode ===
      "grid" ? (
        isLoadingGallery ? (
          <View
            style={
              styles.center
            }
          >
            <ActivityIndicator
              color={
                colors.text1
              }
            />
          </View>
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
      ) : null}

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
      backgroundColor:
        colors.bg0,
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

    headerTitle: {
      color:
        colors.text0,
      fontSize:
        font.lg,
      fontWeight:
        font.semibold,
    },

    toggle: {
      flexDirection:
        "row",
      backgroundColor:
        colors.bg2,
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

    toggleActive: {
      backgroundColor:
        colors.bg1,
    },

    toggleText: {
      color:
        colors.text2,
      fontSize:
        font.sm,
    },

    toggleTextActive: {
      color:
        colors.text0,
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
      backgroundColor:
        colors.bg1,
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
      color:
        colors.text0,
      fontSize:
        font.sm,
    },

    tagChipClose: {
      color:
        colors.text2,
      marginLeft: 8,
      fontSize: 15,
    },

    addChip: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor:
        colors.bg2,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginBottom:
        spacing.sm,
    },

    addChipText: {
      color:
        colors.text2,
      fontSize: 20,
      marginTop: -2,
    },

    inlineInput: {
      minWidth: 80,
      color:
        colors.text0,
      fontSize:
        font.sm,
      backgroundColor:
        colors.bg1,
      borderRadius:
        radius.full,
      paddingHorizontal:
        14,
      paddingVertical:
        8,
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
  });