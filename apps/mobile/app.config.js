const { existsSync } = require('node:fs');
const { join } = require('node:path');

/**
 * app.json plus one optional file: put the Firebase file google-services.json next to this one to
 * turn on push notifications in Android builds (see docs/PUSH_NOTIFICATIONS.md). Without it the
 * app builds and works the same, with screens updating live while open.
 *
 * @param {import('expo/config').ConfigContext} context
 * @returns {import('expo/config').ExpoConfig}
 */
module.exports = ({ config }) => {
  const hasFirebase = existsSync(join(__dirname, 'google-services.json'));
  return {
    ...config,
    android: { ...config.android, ...(hasFirebase ? { googleServicesFile: './google-services.json' } : {}) },
  };
};
