/**
 * src/screens/ChatScreen.tsx
 * ChatGPT-style GallерAI chat screen
 *
 * Multi-select support:
 *   Reuses the shared selection infrastructure (useSelectionStore,
 *   SelectableImage, SelectionBar, AlbumPickerModal) that Gallery uses,
 *   scoped to selectionContext="chat".
 */

import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, font } from "../utils/theme";
import {
  useChatStore,
  useAlbumStore,
  useSelectionStore,
  ChatMessage,
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
                      thumbnailUrl={
                        img.thumbnail_url
                      }
                      size={THUMB}
                      selectionContext="chat"
                      // Tap behaviour outside selection mode is unchanged
                      // from before (no-op) — SelectableImage only invokes
                      // this when selection isn't active for "chat".
                      onLongPress={() =>
                        setActionSheet(
                          {
                            visible:
                              true,
                            imageId:
                              img.id,
                          }
                        )
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
        GallерAI
      </Text>

      <Text
        style={
          styles.emptySubtitle
        }
      >
        Ask anything about
        your photos
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      style={styles.root}
      edges={["top"]}
    >
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
            <TouchableOpacity
              style={
                styles.plusBtn
              }
            >
              <Text
                style={
                  styles.plusIcon
                }
              >
                +
              </Text>
            </TouchableOpacity>

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
        "#ffffff",
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
      color: "#000",
      fontSize: 18,
      fontWeight:
        "700",
    },
  });