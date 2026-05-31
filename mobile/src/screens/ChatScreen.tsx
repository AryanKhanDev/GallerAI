/**
 * src/screens/ChatScreen.tsx
 * ChatGPT-style GallerAI chat screen
 */

import React, {
  useState,
  useRef,
  useCallback,
} from "react";

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
  Image,
  Pressable,
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
  useChatStore,
  useAlbumStore,
  useThemeStore,
  ChatMessage,
} from "../store";

import {
  queryImages,
  createAlbum,
  addToAlbum,
  deleteAlbum,
  BASE_URL,
} from "../api/client";

import {
  parseCommand,
  findAlbumByName,
} from "../utils/commandParser";

import ImageActionSheet from "../components/ImageActionSheet";

const SCREEN_W =
  Dimensions.get(
    "window"
  ).width;

const THUMB =
  (SCREEN_W -
    spacing.lg * 2 -
    spacing.sm * 2) /
  3;

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

  const mode =
    useThemeStore(
      (s) =>
        s.mode
    );

  const toggleTheme =
    useThemeStore(
      (s) =>
        s.toggleTheme
    );

  const colors =
    getColors(mode);

  const [
    input,
    setInput,
  ] = useState("");

  const [
    actionSheet,
    setActionSheet,
  ] = useState<{
    visible: boolean;
    imageId:
      | string
      | null;
    imageIds?: string[];
  }>({
    visible: false,
    imageId: null,
  });

  const listRef =
    useRef<FlatList>(
      null
    );

  const lastResults =
    useRef<
      string[]
    >([]);

  const scrollToBottom =
    () => {
      setTimeout(
        () => {
          listRef.current?.scrollToEnd(
            {
              animated:
                true,
            }
          );
        },
        100
      );
    };

  const handleSend =
    useCallback(
      async () => {
        const text =
          input.trim();

        if (
          !text ||
          isLoading
        )
          return;

        setInput("");

        const userMsg: ChatMessage =
          {
            id: Date.now().toString(),
            role:
              "user",
            text,
          };

        addMessage(
          userMsg
        );

        setLoading(
          true
        );

        scrollToBottom();

        const command =
          parseCommand(
            text
          );

        try {
          switch (
            command.type
          ) {
            case "clear_chat": {
              clearChat();
              setLoading(
                false
              );
              return;
            }

            case "query": {
              const result =
                  await queryImages(
                    command.text,
                    20,
                    "chat"
                  );

              lastResults.current =
                result.results.map(
                  (
                    r
                  ) =>
                    r.id
                );

              const hasResults =
                result
                  .results
                  .length >
                0;

              const replyText =
                hasResults
                  ? `Found ${
                      result
                        .results
                        .length
                    } image${
                      result
                        .results
                        .length ===
                      1
                        ? ""
                        : "s"
                    } · ${Math.round(
                      result.latency_ms
                    )}ms`
                  : "No images matched that query.";

              addMessage(
                {
                  id: (
                    Date.now() +
                    1
                  ).toString(),
                  role:
                    "assistant",
                  text:
                    replyText,
                  images:
                    result.results,
                  action:
                    "query",
                  latency_ms:
                    result.latency_ms,
                }
              );

              break;
            }

            case "create_album": {
              const sourceIds =
                command.fromResults
                  ? lastResults.current
                  : [];

              const album =
                await createAlbum(
                  command.name,
                  sourceIds,
                  text
                );

              addAlbum(
                album
              );

              addMessage(
                {
                  id: (
                    Date.now() +
                    1
                  ).toString(),
                  role:
                    "assistant",
                  text: `Album "${command.name}" created${
                    sourceIds.length
                      ? ` with ${sourceIds.length} images`
                      : ""
                  }.`,
                  action:
                    "album_created",
                  albumId:
                    album.id,
                }
              );

              break;
            }

            case "add_to_album": {
              const album =
                findAlbumByName(
                  albums,
                  command.albumName
                );

              if (
                !album
              ) {
                addMessage(
                  {
                    id: (
                      Date.now() +
                      1
                    ).toString(),
                    role:
                      "assistant",
                    text: `Couldn't find an album called "${command.albumName}".`,
                    action:
                      "error",
                  }
                );

                break;
              }

              if (
                !lastResults
                  .current
                  .length
              ) {
                addMessage(
                  {
                    id: (
                      Date.now() +
                      1
                    ).toString(),
                    role:
                      "assistant",
                    text: "No recent results to add.",
                    action:
                      "error",
                  }
                );

                break;
              }

              await addToAlbum(
                album.id,
                lastResults.current
              );

              addMessage(
                {
                  id: (
                    Date.now() +
                    1
                  ).toString(),
                  role:
                    "assistant",
                  text: `Added ${lastResults.current.length} images to "${album.name}".`,
                  action:
                    "added_to_album",
                }
              );

              break;
            }
            case "delete_album": {
              const album =
                findAlbumByName(
                  albums,
                  command.albumName
                );

              if (
                !album
              ) {
                addMessage(
                  {
                    id: (
                      Date.now() +
                      1
                    ).toString(),
                    role:
                      "assistant",
                    text: `Couldn't find an album called "${command.albumName}".`,
                    action:
                      "error",
                  }
                );

                break;
              }

              await deleteAlbum(
                album.id
              );

              removeAlbum(
                album.id
              );

              addMessage(
                {
                  id: (
                    Date.now() +
                    1
                  ).toString(),
                  role:
                    "assistant",
                  text: `Album "${album.name}" deleted.`,
                }
              );

              break;
            }
          }
        } catch (
          e: any
        ) {
          addMessage(
            {
              id: (
                Date.now() +
                1
              ).toString(),
              role:
                "assistant",
              text: `Error: ${
                e?.message ||
                "Something went wrong."
              }`,
              action:
                "error",
            }
          );
        } finally {
          setLoading(
            false
          );
          scrollToBottom();
        }
      },
      [
        input,
        isLoading,
        albums,
      ]
    );

  const renderMessage =
    ({
      item,
    }: {
      item: ChatMessage;
    }) => {
      const isUser =
        item.role ===
        "user";

      return (
        <View
          style={[
            styles.msgRow,
            isUser && {
              alignItems:
                "flex-end",
            },
          ]}
        >
          <View
            style={[
              styles.bubble,
              {
                backgroundColor:
                  isUser
                    ? colors.bg2
                    : colors.bg1,
              },
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                {
                  color:
                    colors.text0,
                },
              ]}
            >
              {item.text}
            </Text>

            {item.images &&
              item.images
                .length >
                0 && (
                <View
                  style={
                    styles.resultsGrid
                  }
                >
                  {item.images.map(
                    (
                      img
                    ) => {
                      const uri =
                        img.thumbnail_url.startsWith(
                          "http"
                        )
                          ? img.thumbnail_url
                          : `${BASE_URL}${img.thumbnail_url}`;

                      return (
                        <TouchableOpacity
                          key={
                            img.id
                          }
                          style={[
                            styles.thumb,
                            {
                              width:
                                THUMB,
                              height:
                                THUMB,
                              backgroundColor:
                                colors.bg2,
                            },
                          ]}
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
                        >
                          <Image
                            source={{
                              uri,
                            }}
                            style={
                              styles.thumbImg
                            }
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      );
                    }
                  )}
                </View>
              )}
          </View>
        </View>
      );
    };

  const EmptyState =
    () => (
      <View
        style={
          styles.emptyState
        }
      >
        <Pressable
          onPress={
            toggleTheme
          }
          style={
            styles.heroTitleWrap
          }
        >
          <Text
            style={[
              styles.emptyTitle,
              {
                color:
                  colors.text0,
              },
            ]}
          >
            GallerAI
          </Text>

          {mode ===
          "dark" ? (
            <Moon
              size={18}
              color={
                colors.text1
              }
            />
          ) : (
            <Sun
              size={18}
              color={
                colors.text1
              }
            />
          )}
        </Pressable>

        <Text
          style={[
            styles.emptySubtitle,
            {
              color:
                colors.text1,
            },
          ]}
        >
          Ask anything about
          your photos
        </Text>
      </View>
    );

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
      <KeyboardAvoidingView
        style={
          styles.flex
        }
        behavior={
          Platform.OS ===
          "ios"
            ? "padding"
            : undefined
        }
      >
        <FlatList
          ref={listRef}
          data={
            messages
          }
          renderItem={
            renderMessage
          }
          keyExtractor={(
            m
          ) => m.id}
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
              style={[
                styles.typingText,
                {
                  color:
                    colors.text2,
                },
              ]}
            >
              Searching…
            </Text>
          </View>
        )}

        <View
          style={[
            styles.inputBar,
            {
              backgroundColor:
                colors.bg0,
            },
          ]}
        >
          <View
            style={[
              styles.composer,
              {
                backgroundColor:
                  colors.bg1,
              },
            ]}
          >
            <TouchableOpacity
              style={
                styles.plusBtn
              }
            >
              <Text
                style={[
                  styles.plusIcon,
                  {
                    color:
                      colors.text1,
                  },
                ]}
              >
                +
              </Text>
            </TouchableOpacity>

            <TextInput
              style={[
                styles.input,
                {
                  color:
                    colors.text0,
                },
              ]}
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
                {
                  backgroundColor:
                    colors.accent,
                },
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
                style={[
                  styles.sendIcon,
                  {
                    color:
                      colors.accentText,
                  },
                ]}
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

    flex: {
      flex: 1,
    },

    list: {
      paddingHorizontal:
        spacing.md,
      paddingTop:
        spacing.lg,
      paddingBottom:
        12,
    },

    msgRow: {
      marginBottom:
        spacing.md,
      alignItems:
        "flex-start",
    },

    bubble: {
      maxWidth:
        "88%",
      borderRadius:
        radius.lg,
      padding:
        spacing.md,
    },

    bubbleText: {
      fontSize:
        font.md,
      lineHeight:
        22,
    },

    resultsGrid: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap:
        spacing.sm,
      marginTop:
        spacing.md,
    },

    thumb: {
      borderRadius:
        radius.sm,
      overflow:
        "hidden",
    },

    thumbImg: {
      width:
        "100%",
      height:
        "100%",
    },

    emptyState: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    heroTitleWrap: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 8,
      marginBottom:
        spacing.sm,
    },

    emptyTitle: {
      fontSize:
        font.display,
      fontWeight:
        font.bold,
    },

    emptySubtitle: {
      fontSize:
        font.md,
      textAlign:
        "center",
    },

    typing: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        spacing.sm,
      paddingHorizontal:
        spacing.lg,
      paddingBottom:
        spacing.sm,
    },

    typingText: {
      fontSize:
        font.sm,
    },

    inputBar: {
      paddingHorizontal:
        spacing.md,
      paddingBottom:
        spacing.md,
    },

    composer: {
      flexDirection:
        "row",
      alignItems:
        "flex-end",
      borderRadius:
        28,
      paddingLeft:
        10,
      paddingRight:
        8,
      paddingVertical:
        8,
      minHeight:
        58,
    },

    plusBtn: {
      width: 36,
      height: 36,
      borderRadius:
        18,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginRight:
        6,
    },

    plusIcon: {
      fontSize:
        28,
      fontWeight:
        "300",
    },

    input: {
      flex: 1,
      fontSize:
        font.md,
      lineHeight:
        22,
      maxHeight:
        120,
      paddingVertical:
        10,
    },

    sendBtn: {
      width: 38,
      height: 38,
      borderRadius:
        19,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginLeft: 4,
    },

    sendBtnDisabled: {
      opacity:
        0.35,
    },

    sendIcon: {
      fontSize:
        18,
      fontWeight:
        "700",
    },
  });