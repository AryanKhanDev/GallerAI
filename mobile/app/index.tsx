/**
 * app/index.tsx
 * Main entry point.
 *
 * Layout: horizontal PagerView — Chat (index 0) | Gallery (index 1)
 * Swipe left from Chat → Gallery.
 * Swipe right from Gallery → Chat.
 *
 * Bottom indicator dots show current screen.
 * No visible tab bar — pure swipe navigation.
 */

import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  ScrollView,
  Animated,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import ChatScreen from "../src/screens/ChatScreen";
import GalleryScreen from "../src/screens/GalleryScreen";
import { colors } from "../src/utils/theme";

const SCREEN_W = Dimensions.get("window").width;

export default function App() {
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  const goToPage = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_W, animated: true });
    setPage(index);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          {
            useNativeDriver: false,
            listener: (e: any) => {
              const x = e.nativeEvent.contentOffset.x;
              const newPage = Math.round(x / SCREEN_W);
              if (newPage !== page) setPage(newPage);
            },
          }
        )}
        style={styles.pager}
      >
        {/* Screen 0: Chat */}
        <View style={styles.screen}>
          <ChatScreen />
        </View>

        {/* Screen 1: Gallery */}
        <View style={styles.screen}>
          <GalleryScreen />
        </View>
      </Animated.ScrollView>

      {/* Page indicator dots */}
      <View style={styles.dots}>
        {[0, 1].map((i) => {
          const opacity = scrollX.interpolate({
            inputRange: [(i - 1) * SCREEN_W, i * SCREEN_W, (i + 1) * SCREEN_W],
            outputRange: [0.3, 1, 0.3],
            extrapolate: "clamp",
          });
          const width = scrollX.interpolate({
            inputRange: [(i - 1) * SCREEN_W, i * SCREEN_W, (i + 1) * SCREEN_W],
            outputRange: [6, 20, 6],
            extrapolate: "clamp",
          });
          return (
            <Animated.View
              key={i}
              style={[styles.dot, { opacity, width }]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },
  pager: { flex: 1 },
  screen: { width: SCREEN_W, flex: 1 },
  dots: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
});
