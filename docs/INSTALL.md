# Installing Longitude

Download the latest files from the **[Releases page](https://github.com/jrulloda14/Longitude/releases/latest)**. Each release lists SHA-256 checksums in `SHA256SUMS.txt` so you can confirm your download is intact.

Longitude isn't code-signed yet. Both Windows and macOS will warn that the app comes from an unidentified developer the first time you open it. The steps below use the standard, built-in way to allow it. You never need to turn off any security feature.

## Windows 10 and 11

1. Download `Longitude_<version>_x64-setup.exe`.
2. Open it. If **"Windows protected your PC"** appears, click **More info**, then **Run anyway**.
3. The installer sets Longitude up for your user account; no administrator rights are needed. It may download Microsoft's WebView2 runtime if your PC doesn't have it, which Windows 11 and up-to-date Windows 10 already include.
4. Open **Longitude** from the Start menu.

**Updating:** download the newer installer and run it. Your locations, groups and settings are kept.

**Uninstalling:** go to **Settings → Apps → Installed apps**, find **Longitude** and choose **Uninstall**. Your saved settings stay in `%APPDATA%\app.longitude.desktop` in case you reinstall; delete that folder if you want them gone too.

## macOS 12 and later (preview)

The Mac version is a **preview**. It's built and tested automatically, but it isn't signed or notarized by Apple yet and hasn't been checked on real Mac hardware. Please [report anything that doesn't work](https://github.com/jrulloda14/Longitude/issues/new/choose).

1. Download `Longitude_<version>_universal.dmg`. It runs natively on both Apple Silicon and Intel Macs.
2. Open the DMG and drag **Longitude** into **Applications**.
3. Open Longitude from Applications. macOS will say it can't verify the developer; click **Done** (or **Cancel**).
4. Open **System Settings → Privacy & Security**, scroll down to the message about Longitude and click **Open Anyway**. Confirm with your password or Touch ID.
5. Longitude opens normally from then on.

**Updating:** quit Longitude, then replace the app in Applications with the new one. Your settings are kept.

**Uninstalling:** quit Longitude, turn off **Launch at sign-in** first if you enabled it, then drag the app from Applications to the Trash. Saved settings are in `~/Library/Application Support/app.longitude.desktop`.

## Privacy

Longitude works fully offline. It has no account, telemetry, analytics or automatic update checks. The only files it writes are its own settings and any calendar file you choose to save.

## Build it yourself

See [Build from source](../README.md#build-from-source) in the README and [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md) for packaging details.
