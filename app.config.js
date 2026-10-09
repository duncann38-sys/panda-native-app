module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_ANDROID_KEY;
  if (process.env.EAS_BUILD_PLATFORM === 'android' && !key) {
    throw new Error('Android Google Maps configuration is missing. Refusing to build a crashing Map tab.');
  }
  return {
    ...config,
    android: { ...config.android, config: { ...config.android?.config, googleMaps: { apiKey: key } } },
  };
};
