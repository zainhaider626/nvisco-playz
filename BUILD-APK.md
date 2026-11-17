# Android app (APK) in 6 steps

The Android app is a thin shell that opens your live game. **You update the game by deploying the server; every installed phone gets the new version the next time it opens the app.** A new APK is only needed to change the app icon, name or server address.

GitHub builds the APK for you (no Android Studio needed).

1. **Host the server** (see README, "Put it online"). You need its public address, for example `https://nvisco-playz.onrender.com`.
2. **GitHub repo > Settings > Secrets and variables > Actions > Variables > New variable**: name `SERVER_URL`, value your server address (no trailing slash).
3. **Actions tab > "Build APK" > Run workflow.** After a few minutes the run shows a download link (also under Releases). That file is the app: send it to friends on WhatsApp, or point people to `yoursite.com/download` after setting `APK_URL`.
4. **Signing key (do this once, before you share the app widely).** Without it the APK is a test build that cannot be updated over an older install. On any computer with Java:
   ```
   keytool -genkeypair -v -keystore nvisco.keystore -alias nvisco -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 nvisco.keystore      # copy the output
   ```
   Add four repository **Secrets**: `ANDROID_KEYSTORE_BASE64` (that output), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`nvisco`), `ANDROID_KEY_PASSWORD`. **Keep the .keystore file safe forever**: lose it and nobody can update in place.
5. **Installing:** on the phone open the file, allow "install unknown apps" for the app you opened it from, then Install.
6. **New APK later:** run the workflow again with a higher `version_code` (2, 3, 4...). Phones install it over the old one.

Android only. iPhone needs an Apple developer account and the App Store; the game also works as a web app in Safari ("Add to Home Screen").
