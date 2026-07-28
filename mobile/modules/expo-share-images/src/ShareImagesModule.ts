import { requireNativeModule } from "expo-modules-core";

import type { ShareImagesNativeModule } from "./ShareImages.types";

export default requireNativeModule<ShareImagesNativeModule>("ShareImages");
