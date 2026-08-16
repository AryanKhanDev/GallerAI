/**
 * src/components/SelectableImage.tsx
 */

import React, {
  useCallback,
  useRef,
  useEffect,
} from "react";

import {
  TouchableOpacity,
  Image,
  View,
  Animated,
  StyleSheet,
} from "react-native";

import {
  useSelectionStore,
} from "../store";

import {
  colors,
  radius,
} from "../utils/theme";

import {
  BASE_URL,
} from "../api/client";

interface Props {
  id: string;
  thumbnailUrl: string;
  size: number;
  score?: number;
  hasScores?: boolean;

  selectionContext:
    | "chat"
    | "gallery"
    | "album";

  onPress?: () => void;
  onLongPress?: () => void;

  /** Fired exactly once, at the moment THIS image starts a brand new
   * selection session (i.e. when enterSelection is about to be
   * called). Purely informational — does not change selection
   * behavior. Callers that need to know precisely which on-screen
   * item began the selection (e.g. Chat, to scope "Select All" to
   * the correct response bubble even when the same image id appears
   * in more than one bubble) can use this instead of inferring it
   * from selectedIds after the fact. */
  onSelectStart?: (id: string) => void;
}

export default function SelectableImage({
  id,
  thumbnailUrl,
  size,
  score,
  hasScores = false,
  selectionContext,
  onPress,
  onLongPress,
  onSelectStart,
}: Props) {
  const {
    isSelecting,
    toggleId,
    enterSelection,
    isSelected,
    context,
  } =
    useSelectionStore();

  const selected =
    isSelected(id);

  const activeInContext =
    isSelecting &&
    context ===
      selectionContext;

  const scaleAnim =
    useRef(
      new Animated.Value(1)
    ).current;

  const checkAnim =
    useRef(
      new Animated.Value(
        selected
          ? 1
          : 0
      )
    ).current;

  const ringAnim =
    useRef(
      new Animated.Value(
        activeInContext
          ? 1
          : 0
      )
    ).current;

  useEffect(() => {
    Animated.spring(
      checkAnim,
      {
        toValue:
          selected
            ? 1
            : 0,
        useNativeDriver:
          true,
        damping: 18,
        stiffness:
          280,
      }
    ).start();
  }, [selected]);

  useEffect(() => {
    Animated.timing(
      ringAnim,
      {
        toValue:
          activeInContext
            ? 1
            : 0,
        duration: 160,
        useNativeDriver:
          false,
      }
    ).start();
  }, [activeInContext]);

  const handlePress =
    useCallback(() => {
      if (
        activeInContext
      ) {
        Animated.sequence(
          [
            Animated.timing(
              scaleAnim,
              {
                toValue:
                  0.92,
                duration:
                  80,
                useNativeDriver:
                  true,
              }
            ),
            Animated.spring(
              scaleAnim,
              {
                toValue:
                  1,
                useNativeDriver:
                  true,
                damping:
                  14,
              }
            ),
          ]
        ).start();

        toggleId(id);
      } else {
        onPress?.();
      }
    }, [
      activeInContext,
      id,
      onPress,
    ]);

  const handleLongPress =
  useCallback(() => {
    if (
      activeInContext
    ) {
      toggleId(id);
      return;
    }

    if (
      !isSelecting
    ) {
      Animated.sequence(
        [
          Animated.timing(
            scaleAnim,
            {
              toValue:
                0.88,
              duration:
                100,
              useNativeDriver:
                true,
            }
          ),
          Animated.spring(
            scaleAnim,
            {
              toValue:
                1,
              useNativeDriver:
                true,
              damping:
                12,
            }
          ),
        ]
      ).start();

      enterSelection(
        id,
        selectionContext
      );

      onSelectStart?.(id);

      return;
    }

    onLongPress?.();
  }, [
    activeInContext,
    isSelecting,
    id,
    selectionContext,
    onLongPress,
    onSelectStart,
  ]);

  const opacity =
    hasScores &&
    score !==
      undefined
      ? score < 0.2
        ? 0.07
        : score <
          0.35
        ? 0.28
        : 1
      : 1;

  const uri =
    thumbnailUrl.startsWith(
      "http"
    )
      ? thumbnailUrl
      : `${BASE_URL}${thumbnailUrl}`;

  const borderColor =
    ringAnim.interpolate(
      {
        inputRange: [
          0, 1,
        ],
        outputRange: [
          "transparent",
          colors.accent,
        ],
      }
    );

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          width:
            size,
          height:
            size,
          opacity,
          transform: [
            {
              scale:
                scaleAnim,
            },
          ],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={
          0.85
        }
        onPress={
          handlePress
        }
        onLongPress={
          handleLongPress
        }
        delayLongPress={
          300
        }
        style={
          styles.touchable
        }
      >
        <Animated.View
          style={[
            styles.ring,
            {
              borderColor,
            },
          ]}
        />

        <Image
          source={{
            uri,
          }}
          style={
            styles.image
          }
          resizeMode="cover"
        />

        <Animated.View
          style={[
            styles.checkContainer,
            {
              transform:
                [
                  {
                    scale:
                      checkAnim.interpolate(
                        {
                          inputRange:
                            [
                              0,
                              0.5,
                              1,
                            ],
                          outputRange:
                            [
                              0,
                              1.2,
                              1,
                            ],
                        }
                      ),
                  },
                ],
              opacity:
                checkAnim,
            },
          ]}
        >
          <View
            style={[
              styles.check,
              selected &&
                styles.checkActive,
            ]}
          >
            <View
              style={
                styles.checkTick
              }
            />
          </View>
        </Animated.View>

        {activeInContext &&
          !selected && (
            <View
              style={
                styles.dimOverlay
              }
            />
          )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles =
  StyleSheet.create({
    wrapper: {
      borderRadius:
        radius.sm,
      overflow:
        "hidden",
      backgroundColor:
        colors.bg2,
    },

    touchable: {
      flex: 1,
    },

    ring: {
      position:
        "absolute",
      inset: 0,
      borderRadius:
        radius.sm,
      borderWidth:
        2.5,
      zIndex: 2,
    },

    image: {
      width: "100%",
      height:
        "100%",
    },

    checkContainer: {
      position:
        "absolute",
      top: 6,
      right: 6,
      zIndex: 3,
    },

    check: {
      width: 22,
      height: 22,
      borderRadius:
        11,
      borderWidth:
        2,
      borderColor:
        "#fff",
      backgroundColor:
        "rgba(0,0,0,0.35)",
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    checkActive: {
      backgroundColor:
        colors.accent,
      borderColor:
        colors.accent,
    },

    checkTick: {
      width: 10,
      height: 6,
      borderLeftWidth:
        2,
      borderBottomWidth:
        2,
      borderColor:
        "#000",
      marginTop:
        -2,
      transform: [
        {
          rotate:
            "-45deg",
        },
      ],
    },

    dimOverlay: {
      position:
        "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor:
        "rgba(0,0,0,0.38)",
      zIndex: 1,
    },
  });