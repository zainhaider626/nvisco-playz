// Capacitor config for the Nvisco Playz Android shell.
//
// The app is a thin WebView that loads the LIVE game from SERVER_URL, so game
// updates only need a server deploy. SERVER_URL is read when you run
// `npx cap sync android` (locally or in GitHub Actions) and baked into the APK.
const fs = require('fs');
const path = require('path');

const raw = (process.env.SERVER_URL || '').trim();
const isCI = !!process.env.CI;

if (!raw) {
  const msg =
    '\n[Nvisco Playz] SERVER_URL is not set.\n' +
    'Set it to the public address of your game server, for example:\n' +
    '  SERVER_URL=https://play.example.com npx cap sync android\n' +
    'In GitHub: Settings > Secrets and variables > Actions > Variables > SERVER_URL\n' +
    '(or type it into the "Build APK" workflow when you run it).\n';
  if (isCI) {
    throw new Error(msg);
  }
  console.error(msg + 'Using a placeholder (https://example.com) - this build will NOT reach your game.\n');
}

const serverUrl = (raw || 'https://example.com').replace(/\/+$/, '');

let parsed;
try {
  parsed = new URL(serverUrl);
} catch (e) {
  throw new Error(`[Nvisco Playz] SERVER_URL "${serverUrl}" is not a valid URL. Use e.g. https://play.example.com`);
}
if (!/^https?:$/.test(parsed.protocol)) {
  throw new Error(`[Nvisco Playz] SERVER_URL must start with https:// (or http:// for testing). Got: ${serverUrl}`);
}
const cleartext = parsed.protocol === 'http:';

// The bundled offline page (www/index.html) runs from https://localhost inside the app and
// cannot read this config, so write the URL next to it. Runs on every `cap` command, before
// `cap sync` copies www into the Android project.
fs.writeFileSync(
  path.join(__dirname, 'www', 'server-config.js'),
  '// Generated from SERVER_URL by capacitor.config.js - do not edit.\n' +
    `window.NVISCO_SERVER_URL = ${JSON.stringify(serverUrl)};\n`
);

/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.nvisco.playz',
  appName: 'Nvisco Playz',
  webDir: 'www',
  backgroundColor: '#000000',
  server: {
    url: serverUrl,
    cleartext,
    androidScheme: 'https',
    // Shown by the WebView when the server cannot be reached (no internet, server down, HTTP error).
    errorPath: 'index.html',
    allowNavigation: [parsed.hostname],
  },
  android: {
    backgroundColor: '#000000',
    allowMixedContent: cleartext,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      // The web app is remote and does not call SplashScreen.hide(), so use the fixed, reliable
      // option: show the splash for 1.5 s, then fade out.
      launchShowDuration: 1500,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK', // "DARK" = light (white) icons/text, for use on a dark background
      backgroundColor: '#000000',
      overlaysWebView: false,
    },
  },
};

module.exports = config;
