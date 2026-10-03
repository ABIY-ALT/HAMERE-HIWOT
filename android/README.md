# Hamere Hiwot — Android app

A Trusted Web Activity: the app opens https://hamere-hiwot.onrender.com full
screen using Chrome's engine. Website updates appear in the app automatically;
a new APK is only needed if this folder changes (icon, name, address).

- Package: `org.hamerehiwot.ssms`
- Permission asked: notifications only (on first launch, Android 13+)
- Built files: `release/HamereHiwot-<version>.apk` (to share) and
  `release/HamereHiwot-<version>-playstore.aab` (for Google Play)

## Signing key — keep it safe

`keystore/hamere-hiwot-release.jks` and `keystore.properties` (its passwords)
are **not in git**. Copy both to a safe place (a USB stick and a private
cloud folder). Every update must be signed with this same key: without it,
phones cannot update the installed app, and Google Play will refuse updates.

The key's SHA-256 fingerprint is published in
`ssms/public/.well-known/assetlinks.json`; that file lets Android open the
site without a browser address bar. If the app goes on Google Play with
"Play App Signing", also add the fingerprint Play Console shows under
*Setup → App signing* to that file.

## Build a new version

1. In `app/build.gradle.kts`, raise `versionCode` by 1 and set `versionName`.
2. From this folder: `gradlew.bat assembleRelease bundleRelease`
3. Outputs: `app/build/outputs/apk/release/app-release.apk` and
   `app/build/outputs/bundle/release/app-release.aab`

Needs JDK 17 and the Android SDK (`local.properties` points to it).
