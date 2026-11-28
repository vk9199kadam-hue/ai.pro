const { withAppBuildGradle, withMainApplication } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to wire Media3 GPU dependencies and VideoRendererPackage
 * automatically during `expo prebuild` / `eas build`.
 */
module.exports = function withVideoRenderer(config) {
  // 1. Add AndroidX Media3 dependencies to android/app/build.gradle
  config = withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;
    if (!contents.includes('androidx.media3:media3-transformer')) {
      const media3Deps = `
    // AndroidX Media3 Hardware-Accelerated Video Pipeline
    implementation "androidx.media3:media3-transformer:1.3.1"
    implementation "androidx.media3:media3-effect:1.3.1"
    implementation "androidx.media3:media3-common:1.3.1"
    implementation "androidx.media3:media3-exoplayer:1.3.1"
`;
      contents = contents.replace(
        /dependencies\s*\{/,
        `dependencies {${media3Deps}`
      );
      mod.modResults.contents = contents;
    }
    return mod;
  });

  // 2. Register VideoRendererPackage in MainApplication.kt / MainApplication.java
  config = withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;
    if (!contents.includes('VideoRendererPackage')) {
      // Kotlin MainApplication
      if (mod.modResults.language === 'kt') {
        contents = contents.replace(
          /packages\.add\(/,
          'packages.add(com.aipro.viralshorts.VideoRendererPackage())\n      packages.add('
        );
        if (!contents.includes('VideoRendererPackage()')) {
          contents = contents.replace(
            /PackageList\(this\)\.packages\.apply\s*\{/,
            'PackageList(this).packages.apply {\n              add(com.aipro.viralshorts.VideoRendererPackage())'
          );
        }
      } else {
        // Java MainApplication
        contents = contents.replace(
          /return packages;/,
          'packages.add(new com.aipro.viralshorts.VideoRendererPackage());\n      return packages;'
        );
      }
      mod.modResults.contents = contents;
    }
    return mod;
  });

  return config;
};

