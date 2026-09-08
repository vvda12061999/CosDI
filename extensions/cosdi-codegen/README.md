# CosDI Codegen

Cocos Creator 3.0+ editor extension for [CosDI](https://github.com/vvda12061999/CosDI). It gives an interface a runtime token so it can be a DI key, without adding anything to the file the interface lives in, and it reads the project's dependency injection before the project is built.

## Install

Run this in your Cocos Creator project root:

```bash
npm install cosdi cosdi-codegen
```

`npm install` copies the extension into `extensions/cosdi-codegen`, generates your tokens, and leaves the project ready to compile. Restart Cocos Creator to pick up the editor menu.

## Use

Tag an interface:

```ts
/** @generateToken */
export interface IPlayerService {
    attack(): void;
}
```

The token is written to `node_modules/cosdi-tokens`, never into `assets/`:

```ts
import { IPlayerService } from 'cosdi-tokens';

builder.register(PlayerService, Lifetime.Singleton).as(IPlayerService);

@inject(IPlayerService)
private playerService: IPlayerService;
```

`IPlayerService` is the interface in type position and the token in value position, so one import covers both.

It regenerates when the extension loads, on every `.ts` save, and from **CosDI → Generate Interface Tokens**.

## Validate

The container checks its registrations when it is built, which is only as far as play gets. The same mistakes are read out of the sources on every save, from **CosDI → Validate Dependencies**, when you press **Build**, and from the CLI:

```
assets/Scripts/Hud.ts:6:5  error  Hud asks for IPlayerServcie (field 'playerService'), which nothing
in this project registers. [missing-registration]
```

It reports a key nothing registers (`missing-registration`), a bare `@inject` no name answers for (`no-key`), `register(IPlayerService)` where the class was meant (`key-as-class`), `@injectable` on a `Component` (`component-injectable`), `@inject` on a constructor parameter (`parameter-decorator`) and loops (`circular-dependency`).

A key that only something outside the project registers cannot be read from the sources; silence one with `"ignore"` below, or with a `// cosdi-ignore` comment on the line or above it.

## CLI

```bash
npx cosdi-codegen generate           # write tokens
npx cosdi-codegen generate --check   # fail if any are stale, for CI
npx cosdi-codegen validate           # read the DI, exit 1 on a problem
npx cosdi-codegen validate --strict  # warnings fail too
npx cosdi-codegen status
npx cosdi-codegen install --project /path/to/project
npx cosdi-codegen uninstall
```

| Flag / variable | Effect |
| --- | --- |
| `--project <path>` | Target project root instead of auto-detecting it |
| `--force` | Replace an `extensions/cosdi-codegen` folder this package did not create |
| `COSDI_CODEGEN_SKIP_INSTALL=1` | Skip the automatic copy during `npm install` |

npm cannot run a script when a dependency is removed, so run `npx cosdi-codegen uninstall` **before** `npm uninstall cosdi-codegen`.

## Settings

Optional `cosdi.codegen.json` in the project root. See the [main README](https://github.com/vvda12061999/CosDI#interface-as-a-service) for every field and mode.

```json
{
  "roots": ["assets/Scripts"],
  "exclude": ["Vendor"],
  "mode": "package",
  "packageName": "cosdi-tokens",
  "generateOnSave": true,
  "validate": {
    "enabled": true,
    "validateOnSave": true,
    "onBuild": "error",
    "ignore": ["IAdsService"],
    "rules": { "no-key": "warn" }
  }
}
```

`onBuild` is `error`, `warn` or `off`; each rule takes the same three.

## License

MIT
