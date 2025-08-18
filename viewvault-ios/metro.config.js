const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    platforms: ['ios', 'android', 'native', 'web'],
    blockList: [
      /temp-web-app\/.*/,
      /__pycache__\/.*/,
      /\.git\/.*/,
    ],
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  maxWorkers: 1,
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config); 