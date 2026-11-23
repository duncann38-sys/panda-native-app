const fs = require('node:fs');

module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_ANDROID_KEY;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  if (process.env.EAS_BUILD_PLATFORM === 'android' && !key) {
    throw new Error('Android Google Maps configuration is missing. Refusing to build a crashing Map tab.');
  }
  if (process.env.EAS_BUILD_PLATFORM === 'android' && !googleServicesFile) {
    throw new Error('Android Firebase configuration is missing. GOOGLE_SERVICES_JSON must be an EAS file environment variable.');
  }
  if (googleServicesFile && !fs.existsSync(googleServicesFile)) {
    throw new Error('GOOGLE_SERVICES_JSON must point to an existing google-services.json file.');
  }
  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile && { googleServicesFile }),
      config: { ...config.android?.config, googleMaps: { apiKey: key } },
    },
  };
};
