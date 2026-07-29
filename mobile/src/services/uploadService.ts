/**
 * src/services/uploadService.ts
 * Camera/library picking + upload + gallery refresh.
 */

import * as ImagePicker from "expo-image-picker";
import { listImages, uploadImage, GalleryImage } from "../api/client";
import { useGalleryStore } from "../store";

export async function refreshGallery(): Promise<void> {
  const data = await listImages(500);
  useGalleryStore.getState().setImages(data.images, data.total);
}

export async function pickFromCamera(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.9,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0].uri;
}

export async function pickFromLibrary(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
  });

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0].uri;
}

/**
 * Uploads the picked image and refreshes the Gallery store so the
 * new photo shows up immediately without a manual pull-to-refresh.
 */
export async function performUpload(uri: string): Promise<GalleryImage> {
  const image = await uploadImage(uri);
  await refreshGallery();
  return image;
}