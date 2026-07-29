/**
 * src/screens/ChatScreen.tsx
 * ChatGPT-style GallерAI chat screen
 *
 * Multi-select support:
 *   Reuses the shared selection infrastructure (useSelectionStore,
 *   SelectableImage, SelectionBar, AlbumPickerModal) that Gallery uses,
 *   scoped to selectionContext="chat".
 *
 * Upload support:
 *   '+' rolls up into a small Camera/Upload menu. A picked/captured
 *   image uploads to the backend, refreshes the Gallery store, then
 *   offers an optional album assignment via PostUploadSheet, which
 *   hands off to the existing AlbumPickerModal.
 */

import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getColors, spacing, radius, font } from "../utils/theme";
import {
  useChatStore,
  useAlbumStore,
  useSelectionStore,
  ChatMessage,
  useThemeStore,
} from "../store";
import {
  queryImages,
  createAlbum,
  addToAlbum,
  deleteAlbum,
  BASE_URL,
  ImageResult,
} from "../api/client";
import {
  parseCommand,
  findAlbumByName,
} from "../utils/commandParser";
import ImageActionSheet from "../components/ImageActionSheet";
import SelectableImage from "../components/SelectableImage";
import SelectionBar from "../components/SelectionBar";
import AlbumPickerModal, {
  AlbumPickerMode,
} from "../components/AlbumPickerModal";
import UploadMenu from "../components/UploadMenu";
import PostUploadSheet from "../components/PostUploadSheet";
import {
  pickFromCamera,
  pickFromLibrary,
  performUpload,
} from "../services/uploadService";

import { Pressable } from "react-native";
import { Moon, Sun } from "lucide-react-native";

import ImageViewerModal from "../components/ImageViewerModal";

const SCREEN_W = Dimensions.get("window").width;
const THUMB =
  (SCREEN_W - spacing.lg * 2 - spacing.sm * 2) / 3;

function resolveUri(url: string) {
  return url.startsWith("http") ? url : `${BASE_URL}${url}`;
}

export default function ChatScreen() {
  const {
    messages,
    isLoading,
    addMessage,
    setLoading,
    clearChat,
  } = useChatStore();

  const {
    albums,
    addAlbum,
    removeAlbum,
  } = useAlbumStore();
  const mode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const colors = getColors(mode);
  const styles = createStyles(colors);
  // Only care about `context` here — used to make sure this screen's
  // SelectionBar only renders when the active selection belongs to chat,
  // since Chat and Gallery are both mounted simultaneously in the pager.
  const { isSelecting, context } = useSelectionStore();

  const [input, setInput] = useState("");

  const [actionSheet, setActionSheet] =
    useState<{
      visible: boolean;
      imageId: string | null;
      imageIds?: string[];
    }>({
      visible: false,
      imageId: null,
    });

  const [albumPicker, setAlbumPicker] =
    useState<{
      mode: AlbumPickerMode;
      ids: string[];
    }>({
      mode: null,
      ids: [],
    });
  
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  // ── Upload menu / flow ────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [postUpload, setPostUpload] =
    useState<{ visible: boolean; imageId: string | null }>({
      visible: false,
      imageId: null,
    });

  const listRef =
    useRef<FlatList>(null);

  // Kept for existing "add to album" / "create album from results" commands.
  const lastResultIds =
    useRef<string[]>([]);

  // Full result objects for the same last query — not used by the current
  // commands, but retained for future sharing support alongside the ids.
  const lastResultImages =
    useRef<ImageResult[]>([]);

  const scrollToBottom = () => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({
        animated: true,
      });
    }, 100);
  };

  // ── Selection helpers ─────────────────────────────────────────────────
  // All images ever rendered in this chat (deduped, in first-seen order),
  // and a uri map keyed by id — both required by SelectionBar.
  const allChatImageIds = React.useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];

    messages.forEach((m) => {
      m.images?.forEach((img) => {
        if (!seen.has(img.id)) {
          seen.add(img.id);
          ids.push(img.id);
        }
      });
    });

    return ids;
  }, [messages]);

  const chatImageUriMap = React.useMemo(() => {
    const map: Record<string, string> = {};

    messages.forEach((m) => {
      m.images?.forEach((img) => {
        if (!map[img.id]) {
          map[img.id] = resolveUri(
            img.image_url || img.thumbnail_url
          );
        }
      });
    });

    return map;
  }, [messages]);

  const handleAddToAlbum = useCallback(
    (ids: string[]) => {
      setAlbumPicker({ mode: "pick", ids });
    },
    []
  );

  const handleCreateAlbumFromSelection = useCallback(
    (ids: string[]) => {
      setAlbumPicker({ mode: "create", ids });
    },
    []
  );

  // ── Upload handlers ──────────────────────────────────────────────────
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);

  const runUpload = useCallback(
    async (uri: string | null) => {
      if (!uri || uploading) return;
      setUploading(true);
      try {
        const image = await performUpload(uri);
        setPostUpload({ visible: true, imageId: image.id });
      } catch (e: any) {
        Alert.alert(
          "Upload failed",
          e?.message || "Something went wrong."
        );
      } finally {
        setUploading(false);
      }
    },
    [uploading]
  );

  const handleCameraPress = useCallback(async () => {
    closeMenu();
    const uri = await pickFromCamera();
    runUpload(uri);
  }, [closeMenu, runUpload]);

  const handleUploadPress = useCallback(async () => {
    closeMenu();
    const uri = await pickFromLibrary();
    runUpload(uri);
  }, [closeMenu, runUpload]);

  const handlePostUploadChoice = useCallback(
    (chosenMode: Exclude<AlbumPickerMode, null>) => {
      const id = postUpload.imageId;
      setPostUpload({ visible: false, imageId: null });
      if (id) {
        setAlbumPicker({ mode: chosenMode, ids: [id] });
      }
    },
    [postUpload.imageId]
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();

    if (!text || isLoading) return;

    setInput("");

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      text,
    };

    addMessage(userMsg);
    setLoading(true);
    scrollToBottom();

    const command = parseCommand(text);

    try {
      switch (command.type) {
        case "clear_chat": {
          clearChat();
          setLoading(false);
          return;
        }

        case "query": {
          const result =
            await queryImages(
              command.text,
              20,
              "chat"
            );

          lastResultIds.current =
            result.results.map(
              (r) => r.id
            );

          lastResultImages.current =
            result.results;

          const hasResults =
            result.results.length > 0;

          const replyText =
            hasResults
              ? `Found ${
                  result.results.length
                } image${
                  result.results.length === 1
                    ? ""
                    : "s"
                } · ${Math.round(
                  result.latency_ms
                )}ms`
              : "No images matched that query.";

          addMessage({
            id: (
              Date.now() + 1
            ).toString(),
            role: "assistant",
            text: replyText,
            images: result.results,
            action: "query",
            latency_ms:
              result.latency_ms,
          });

          break;
        }

        case "create_album": {
          const sourceIds =
            command.fromResults
              ? lastResultIds.current
              : [];

          const album =
            await createAlbum(
              command.name,
              sourceIds,
              text
            );

          addAlbum(album);

          addMessage({
            id: (
              Date.now() + 1
            ).toString(),
            role: "assistant",
            text: `Album "${command.name}" created${
              sourceIds.length
                ? ` with ${sourceIds.length} images`
                : ""
            }.`,
            action:
              "album_created",
            albumId: album.id,
          });

          break;
        }

        case "add_to_album": {
          const album =
            findAlbumByName(
              albums,
              command.albumName
            );

          if (!album) {
            addMessage({
              id: (
                Date.now() + 1
              ).toString(),
              role: "assistant",
              text: `Couldn't find an album called "${command.albumName}".`,
              action: "error",
            });
            break;
          }

          if (
            !lastResultIds.current.length
          ) {
            addMessage({
              id: (
                Date.now() + 1
              ).toString(),
              role: "assistant",
              text: "No recent results to add.",
              action: "error",
            });
            break;
          }

          await addToAlbum(
            album.id,
            lastResultIds.current
          );

          addMessage({
            id: (
              Date.now() + 1
            ).toString(),
            role: "assistant",
            text: `Added ${lastResultIds.current.length} images to "${album.name}".`,
            action:
              "added_to_album",
          });

          break;
        }
        case "delete_album": {
          const album =
            findAlbumByName(
              albums,
              command.albumName
            );

          if (!album) {
            addMessage({
              id: (
                Date.now() + 1
              ).toString(),
              role: "assistant",
              text: `Couldn't find an album called "${command.albumName}".`,
              action: "error",
            });
            break;
          }

          await deleteAlbum(
            album.id
          );

          removeAlbum(album.id);

          addMessage({
            id: (
              Date.now() + 1
            ).toString(),
            role: "assistant",
            text: `Album "${album.name}" deleted.`,
          });

          break;
        }
      }
    } catch (e: any) {
      addMessage({
        id: (
          Date.now() + 1
        ).toString(),
        role: "assistant",
        text: `Error: ${
          e?.message ||
          "Something went wrong."
        }`,
        action: "error",
      });
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [input, isLoading, albums]);

  const renderMessage = ({
    item,
  }: {
    item: ChatMessage;
  }) => {
    const isUser =
      item.role === "user";

    return (
      <View
        style={[
          styles.msgRow,
          isUser &&
            styles.msgRowUser,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isUser
              ? styles.bubbleUser
              : styles.bubbleAssistant,
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              isUser &&
                styles.bubbleTextUser,
            ]}
          >
            {item.text}
          </Text>

          {item.images &&
            item.images.length >
              0 && (
              <View
                style={
                  styles.resultsGrid
                }
              >
                {item.images.map(
                  (img) => (
                    <SelectableImage
                      key={img.id}
                      id={img.id}
                      thumbnailUrl={img.thumbnail_url}
                      size={THUMB}
                      selectionContext="chat"
                      onPress={() => {
                        setViewerImages(
                          item.images!.map((i) =>
                            resolveUri(i.image_url || i.thumbnail_url)
                          )
                        );

                        setViewerIndex(
                          item.images!.findIndex((i) => i.id === img.id)
                        );

                        setViewerVisible(true);
                      }}
                      onLongPress={() =>
                        setActionSheet({
                          visible: true,
                          imageId: img.id,
                        })
                      }
                    />
                  )
                )}
              </View>
            )}
        </View>
      </View>
    );
  };

  const EmptyState = () => (
    <View
      style={
        styles.emptyState
      }
    >
      <Text
        style={
          styles.emptyTitle
        }
      >
        GallеrAI
      </Text>

      <Text
        style={
          styles.emptySubtitle
        }
      >
        Search and organize your photos with AI 
      </Text>
    </View>
  );

  return (
  <SafeAreaView
    style={styles.root}
    edges={["top"]}
  >
    <View style={styles.header}>
      <Text style={[styles.headerTitle, { color: colors.text0 }]}>
        GallerAI
      </Text>

      <Pressable
        onPress={toggleTheme}
        hitSlop={8}
        style={styles.themeToggleBtn}
      >
        {mode === "dark" ? (
          <Moon size={18} color={colors.text1} />
        ) : (
          <Sun size={18} color={colors.text1} />
        )}
      </Pressable>
    </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS ===
          "ios"
            ? "padding"
            : undefined
        }
      >
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={
            renderMessage
          }
          keyExtractor={(m) =>
            m.id
          }
          contentContainerStyle={
            styles.list
          }
          ListEmptyComponent={
            EmptyState
          }
          showsVerticalScrollIndicator={
            false
          }
          onContentSizeChange={
            scrollToBottom
          }
        />

        {isLoading && (
          <View
            style={
              styles.typing
            }
          >
            <ActivityIndicator
              size="small"
              color={
                colors.text1
              }
            />
            <Text
              style={
                styles.typingText
              }
            >
              Searching…
            </Text>
          </View>
        )}

        {menuOpen && (
          <TouchableWithoutFeedback onPress={closeMenu}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
        )}

        {/* ChatGPT composer */}
        <View
          style={
            styles.inputBar
          }
        >
          <View
            style={
              styles.composer
            }
          >
            <View>
              <UploadMenu
                visible={menuOpen}
                onCamera={handleCameraPress}
                onUpload={handleUploadPress}
              />

              <TouchableOpacity
                style={
                  styles.plusBtn
                }
                onPress={toggleMenu}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.text1}
                  />
                ) : (
                  <Text
                    style={
                      styles.plusIcon
                    }
                  >
                    {menuOpen ? "×" : "+"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <TextInput
              style={
                styles.input
              }
              value={input}
              onChangeText={
                setInput
              }
              placeholder="Ask about your photos…"
              placeholderTextColor={
                colors.text2
              }
              multiline
              maxLength={
                300
              }
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!input.trim() ||
                  isLoading) &&
                  styles.sendBtnDisabled,
              ]}
              onPress={
                handleSend
              }
              disabled={
                !input.trim() ||
                isLoading
              }
            >
              <Text
                style={
                  styles.sendIcon
                }
              >
                ↑
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <ImageActionSheet
        visible={
          actionSheet.visible
        }
        imageId={
          actionSheet.imageId
        }
        imageIds={
          actionSheet.imageIds
        }
        onClose={() =>
          setActionSheet({
            visible: false,
            imageId: null,
          })
        }
      />

      {isSelecting &&
        context === "chat" && (
          <SelectionBar
            allIds={
              allChatImageIds
            }
            imageUriMap={
              chatImageUriMap
            }
            onAddToAlbum={
              handleAddToAlbum
            }
            onCreateAlbum={
              handleCreateAlbumFromSelection
            }
            onCancel={() => {}}
          />
        )}

      <AlbumPickerModal
        mode={albumPicker.mode}
        imageIds={albumPicker.ids}
        onClose={() =>
          setAlbumPicker({
            mode: null,
            ids: [],
          })
        }
      />

      <PostUploadSheet
        visible={postUpload.visible}
        onChoose={handlePostUploadChoice}
        onSkip={() =>
          setPostUpload({ visible: false, imageId: null })
        }
      />

      <ImageViewerModal
  visible={viewerVisible}
  images={viewerImages}
  initialIndex={viewerIndex}
  onClose={() => setViewerVisible(false)}
/>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof getColors>) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor:
        colors.bg0,
    },
    header: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  backgroundColor: colors.bg0,

},

headerTitle: {
  fontSize: font.lg,
  fontWeight: font.semibold,
},

themeToggleBtn: {
  padding: 4,
},
    flex: { flex: 1 },

    list: {
      paddingHorizontal:
        spacing.md,
      paddingTop:
        spacing.lg,
      paddingBottom: 12,
    },

    msgRow: {
      marginBottom:
        spacing.md,
      alignItems:
        "flex-start",
    },

    msgRowUser: {
      alignItems:
        "flex-end",
    },

    bubble: {
      maxWidth: "88%",
      borderRadius:
        radius.lg,
      padding:
        spacing.md,
      backgroundColor:
        colors.bg1,
    },

    bubbleUser: {
      backgroundColor:
        colors.bg2,
    },

    bubbleAssistant: {},

    bubbleText: {
      color:
        colors.text0,
      fontSize:
        font.md,
      lineHeight: 22,
    },

    bubbleTextUser: {
      color:
        colors.text0,
    },

    resultsGrid: {
      flexDirection:
        "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop:
        spacing.md,
    },

    emptyState: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    emptyTitle: {
      color:
        colors.text0,
      fontSize:
        font.display,
      fontWeight:
        font.bold,
      marginBottom:
        spacing.sm,
    },

    emptySubtitle: {
      color:
        colors.text1,
      fontSize:
        font.md,
    },

    typing: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: spacing.sm,
      paddingHorizontal:
        spacing.lg,
      paddingBottom:
        spacing.sm,
    },

    typingText: {
      color:
        colors.text2,
      fontSize:
        font.sm,
    },

    inputBar: {
      paddingHorizontal:
        spacing.md,
      paddingBottom:
        spacing.md,
      backgroundColor:
        colors.bg0,
    },

    composer: {
      flexDirection:
        "row",
      alignItems:
        "flex-end",
      backgroundColor:
        colors.bg1,
      borderRadius: 28,
      paddingLeft: 10,
      paddingRight: 8,
      paddingVertical: 8,
      minHeight: 58,
    },

    plusBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginRight: 6,
    },

    plusIcon: {
      color:
        colors.text1,
      fontSize: 28,
      fontWeight:
        "300",
    },

    input: {
      flex: 1,
      color:
      colors.text0,
      fontSize:
        font.md,
      lineHeight: 22,
      maxHeight: 120,
      paddingVertical: 10,
    },

    sendBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor:
        colors.accent,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginLeft: 4,
    },

    sendBtnDisabled: {
      opacity: 0.35,
    },

    sendIcon: {
      color: colors.accentText,
      fontSize: 18,
      fontWeight:
        "700",
    },
  });