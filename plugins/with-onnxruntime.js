// Custom Expo config plugin to manually register onnxruntime-react-native's
// OnnxruntimePackage in MainApplication.kt, since Expo autolinking treats it
// as an Expo module (due to its deprecated unimodule.json) and RN autolinking
// then skips it, so PackageList never includes it.
//
// Without this plugin, NativeModules.Onnxruntime is null on Android.

const { withMainApplication } = require('@expo/config-plugins');

const IMPORT_LINE = 'import ai.onnxruntime.reactnative.OnnxruntimePackage';
const REGISTER_LINE = '              add(OnnxruntimePackage())';

function addImport(contents) {
  if (contents.includes(IMPORT_LINE)) return contents;
  // Insert after the existing expo.modules import block (or any import)
  return contents.replace(
    /(import expo\.modules\.[^\n]+\n)/,
    `$1${IMPORT_LINE}\n`
  );
}

function addPackage(contents) {
  if (contents.includes('OnnxruntimePackage()')) return contents;
  // Insert inside getPackages() ... PackageList(this).packages.apply { ... }
  return contents.replace(
    /(PackageList\(this\)\.packages\.apply\s*\{\s*\n)/,
    `$1${REGISTER_LINE}\n`
  );
}

const withOnnxruntime = (config) =>
  withMainApplication(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('with-onnxruntime expects MainApplication in Kotlin');
    }
    let contents = config.modResults.contents;
    contents = addImport(contents);
    contents = addPackage(contents);
    config.modResults.contents = contents;
    return config;
  });

module.exports = withOnnxruntime;
