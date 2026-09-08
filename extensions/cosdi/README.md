# CosDI Creator extension

This folder is the installable Cocos Creator **3.8+** extension.

## For users

1. Zip the **contents** of this folder (`package.json` must be at the zip root).
2. In Creator: **Extension → Extension Manager → Project → +**
3. Choose `cosdi.zip`
4. **Enable** CosDI

Enabling copies the DI runtime into `assets/CosDI` and opens the Diagnostics panel from **Panel → CosDI Diagnostics**.

## For this repo

`runtime/` is the library that gets installed into a project. After changing `assets/CosDI` in the sample, run `scripts/pack-extension.ps1` to refresh `runtime/` and rebuild `cosdi.zip`.
