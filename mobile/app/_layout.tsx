/**
 * app/_layout.tsx
 * Root layout — sets up safe area, gesture handler, reanimated.
 */

import {
  useEffect,
} from "react";

import { Stack } from "expo-router";

import {
  GestureHandlerRootView,
} from "react-native-gesture-handler";

import {
  StyleSheet,
} from "react-native";

import {
  useThemeStore,
} from "../src/store";

export default function RootLayout() {
  const hydrateTheme =
    useThemeStore(
      (s) =>
        s.hydrateTheme
    );

  useEffect(() => {
    hydrateTheme();
  }, []);

  return (
    <GestureHandlerRootView
      style={styles.root}
    >
      <Stack
        screenOptions={{
          headerShown:
            false,
        }}
      />
    </GestureHandlerRootView>
  );
}

const styles =
  StyleSheet.create({
    root: {
      flex: 1,
    },
  });