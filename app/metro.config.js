const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  sourceExts: [...config.resolver.sourceExts, 'mjs'],
};

config.transformer = {
  ...config.transformer,
  routerRoot: 'screens',
};

module.exports = config;
