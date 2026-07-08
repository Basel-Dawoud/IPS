const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("onnx");
config.resolver.assetExts.push("ort");

module.exports = withNativeWind(config, { input: "./globals.css" });
