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

import React, { useRef, useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
  Animated,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import ChatScreen from "../src/screens/ChatScreen";
import GalleryScreen from "../src/screens/GalleryScreen";
import { colors } from "../src/utils/theme";

export default function App() {
  const { width: screenWidth } = useWindowDimensions();
  const pageRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  const goToPage = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * screenWidth, animated: true });
    pageRef.current = index;
    setPage(index);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: pageRef.current * screenWidth, animated: false });
    scrollX.setValue(pageRef.current * screenWidth);
  }, [screenWidth, scrollX]);

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
              const newPage = Math.round(x / screenWidth);
              const nextPage = Math.max(0, Math.min(1, newPage));
              pageRef.current = nextPage;
              if (nextPage !== page) setPage(nextPage);
            },
          }
        )}
        onContentSizeChange={() => {
          scrollRef.current?.scrollTo({ x: pageRef.current * screenWidth, animated: false });
        }}
        style={styles.pager}
      >
        {/* Screen 0: Chat */}
        <View style={[styles.screen, { width: screenWidth }]}>
          <ChatScreen />
        </View>

        {/* Screen 1: Gallery */}
        <View style={[styles.screen, { width: screenWidth }]}>
          <GalleryScreen />
        </View>
      </Animated.ScrollView>

      {/* Page indicator dots */}
      <View style={styles.dots}>
        {[0, 1].map((i) => {
          const opacity = scrollX.interpolate({
            inputRange: [(i - 1) * screenWidth, i * screenWidth, (i + 1) * screenWidth],
            outputRange: [0.3, 1, 0.3],
            extrapolate: "clamp",
          });
          const width = scrollX.interpolate({
            inputRange: [(i - 1) * screenWidth, i * screenWidth, (i + 1) * screenWidth],
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
  screen: { flex: 1 },
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
