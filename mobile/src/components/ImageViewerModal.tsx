import React, { useCallback, useState } from "react";
import {
  Modal,
  View,
  TouchableOpacity,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from "react-native";

import { Image } from "expo-image";
import {
  Gallery,
  fitContainer,
} from "react-native-zoom-toolkit";

import { X } from "lucide-react-native";

type Props = {
  visible: boolean;
  images: string[];
  initialIndex: number;
  onClose: () => void;
};

function GalleryImage({ uri }: { uri: string }) {
  const { width, height } = useWindowDimensions();

  const [imageSize, setImageSize] = useState({
    width: 1,
    height: 1,
  });

  const size = fitContainer(
    imageSize.width / imageSize.height,
    {
      width,
      height,
    }
  );

  return (
    <Image
      source={{ uri }}
      contentFit="contain"
      style={size}
      onLoad={(e) => {
        setImageSize({
          width: e.source.width,
          height: e.source.height,
        });
      }}
    />
  );
}

export default function ImageViewerModal({
  visible,
  images,
  initialIndex,
  onClose,
}: Props) {
  const renderItem = useCallback(
  (uri: string) => <GalleryImage uri={uri} />,
  []
);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {Platform.OS === "web" && (
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
          >
            <X
              size={30}
              color="white"
            />
          </TouchableOpacity>
        )}

        <Gallery
          data={images}
          initialIndex={initialIndex}
          renderItem={renderItem}
          keyExtractor={(item) => item}
          onSwipe={(direction) => {
            if (
              direction === "down"
            ) {
              onClose();
            }
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  image: {
    flex: 1,
  },

  close: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 100,
  },
});