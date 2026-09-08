# CosDI Diagnostics

Cocos Creator 3.0+ editor panel for [CosDI](https://github.com/vvda12061999/CosDI). It shows the live scope tree, registrations and `CosDIBenchmarkRunner` results while you play a scene.

## Install

Run this in your Cocos Creator project root:

```bash
npm install cosdi cosdi-diagnostics
```

`npm install` copies the extension into `extensions/cosdi-diagnostics` in your project. Restart Cocos Creator, then open **Panel → CosDI Diagnostics**.

No zip import needed.

## CLI

The copy step also runs on demand, which is useful when the project root is not where npm ran:

```bash
npx cosdi-diagnostics install --project /path/to/project
npx cosdi-diagnostics status
npx cosdi-diagnostics uninstall
```

| Flag / variable | Effect |
| --- | --- |
| `--project <path>` | Target project root instead of auto-detecting it |
| `--force` | Replace an `extensions/cosdi-diagnostics` folder this package did not create |
| `COSDI_DIAGNOSTICS_SKIP_INSTALL=1` | Skip the automatic copy during `npm install` |

npm cannot run a script when a dependency is removed, so run `npx cosdi-diagnostics uninstall` **before** `npm uninstall cosdi-diagnostics` to clear the copied folder.

## Usage

1. Keep the panel open and press **Play**.
2. The runtime posts snapshots to `http://127.0.0.1:38477/diagnostics`, which this extension serves back to the panel.
3. `CosDISettings.enableDiagnostics` (from `cosdi`) must be `true`. Turn it off for shipping builds or timing runs.

## License

MIT
