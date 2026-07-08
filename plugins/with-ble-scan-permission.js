// Config plugin: strip `android:usesPermissionFlags="neverForLocation"` from the
// BLUETOOTH_SCAN permission in the merged Android manifest.
//
// Why: react-native-ble-plx's OWN library manifest
// (node_modules/react-native-ble-plx/android/src/main/AndroidManifest.xml)
// declares BLUETOOTH_SCAN with `usesPermissionFlags="neverForLocation"`. Gradle
// manifest-merging folds that flag into the app's final manifest. On Android 12+,
// `neverForLocation` tells the OS the app won't derive location from BLE, so the
// system WITHHOLDS beacon-class (location-deriving) advertisements from scan
// results — ordinary BLE devices still appear, but iBeacons/Eddystone do not.
//
// Navimind DOES use beacons for indoor positioning, so we must keep them. Adding
// `tools:remove="android:usesPermissionFlags"` to our app's BLUETOOTH_SCAN entry
// removes the flag during the merge.

const { withAndroidManifest } = require("@expo/config-plugins");

const SCAN_PERMISSION = "android.permission.BLUETOOTH_SCAN";

const withBleScanPermission = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure the `tools` namespace is declared on <manifest>.
    manifest.$ = manifest.$ || {};
    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    manifest["uses-permission"] = manifest["uses-permission"] || [];

    let scan = manifest["uses-permission"].find(
      (p) => p.$ && p.$["android:name"] === SCAN_PERMISSION,
    );

    if (!scan) {
      scan = { $: { "android:name": SCAN_PERMISSION } };
      manifest["uses-permission"].push(scan);
    }

    // Strip the neverForLocation flag contributed by the ble-plx library manifest.
    scan.$["tools:remove"] = "android:usesPermissionFlags";

    return config;
  });

module.exports = withBleScanPermission;
