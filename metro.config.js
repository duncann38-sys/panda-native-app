const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

// Auth's RN entry requires the CJS registry. Resolve every app importer to
// that same registry instead of creating an unregistered ESM app instance.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@firebase/app') {
    return {
      type: 'sourceFile',
      filePath: require.resolve('@firebase/app', { paths: [require.resolve('firebase/app')] }),
    };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
