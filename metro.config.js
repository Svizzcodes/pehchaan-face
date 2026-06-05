const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .tflite model files as assets
config.resolver.assetExts.push('tflite');

// Polyfill Node's 'buffer' module
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve('buffer'),
};

module.exports = config;
