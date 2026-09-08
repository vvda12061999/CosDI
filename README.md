<p align="center">
  <img src="docs/images/logo.png" width="120" alt="CosDI logo">
</p>

<h1 align="center">CosDI</h1>

<p align="center">
  <strong>VContainer-style dependency injection for Cocos Creator 3.x</strong>
</p>

<p align="center">
  <a href="https://github.com/vvda12061999/CosDI/stargazers"><img src="https://img.shields.io/github/stars/vvda12061999/CosDI?style=social" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/cosdi"><img src="https://img.shields.io/npm/v/cosdi?label=cosdi" alt="cosdi on npm"></a>
  <a href="https://www.npmjs.com/package/cosdi-diagnostics"><img src="https://img.shields.io/npm/v/cosdi-diagnostics?label=cosdi-diagnostics" alt="cosdi-diagnostics on npm"></a>
  <a href="https://github.com/vvda12061999/CosDI/actions/workflows/ci.yml"><img src="https://github.com/vvda12061999/CosDI/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Cocos%20Creator-3.0%2B-00d4aa" alt="Cocos Creator 3.0+">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
</p>

<p align="center">
  <img src="docs/images/banner.png" alt="CosDI — VContainer-style DI for Cocos Creator">
</p>

If this saves you time in a Cocos project, please **[⭐ star the repo](https://github.com/vvda12061999/CosDI)**. Stars help other Creator developers find it.

## Contents

1. [Installation](#1-installation)
2. [Quick start](#2-quick-start)
   - [Service](#service)
   - [Interface token](#interface-token)
   - [Register in a LifetimeScope](#register-in-a-lifetimescope)
   - [Inject a component field](#inject-a-component-field)
   - [`new Player()` fills constructor deps](#new-player-fills-constructor-deps)
3. [Proof of concept](#3-proof-of-concept)
4. [Benchmark](#4-benchmark)
   - [Environment](#environment)
5. [Notes](#5-notes)
6. [How to contribute](#6-how-to-contribute)
7. [Bug reports](#7-bug-reports)
8. [How to support](#8-how-to-support)

---

## 1. Installation

Two packages, both from npm. Run this in your Cocos Creator project root:

```bash
npm install cosdi cosdi-diagnostics
```

| Package | What it is |
| --- | --- |
| [`cosdi`](https://www.npmjs.com/package/cosdi) | The runtime you import from your scripts |
| [`cosdi-diagnostics`](https://www.npmjs.com/package/cosdi-diagnostics) | The **CosDI Diagnostics** editor panel |

Or from GitHub:

```bash
npm install git+https://github.com/vvda12061999/CosDI.git
```

Then:

```ts
import { LifetimeScope, inject, injectable } from 'cosdi';
```

`cosdi-diagnostics` copies itself into `extensions/cosdi-diagnostics` in your project while npm installs it, so no zip import is needed. Restart Cocos Creator and open **Panel → CosDI Diagnostics**.

If npm ran somewhere other than the project root, point it at the project yourself:

```bash
npx cosdi-diagnostics install --project /path/to/project
npx cosdi-diagnostics status
npx cosdi-diagnostics uninstall
```

Set `COSDI_DIAGNOSTICS_SKIP_INSTALL=1` to skip the automatic copy, and run `npx cosdi-diagnostics uninstall` before `npm uninstall cosdi-diagnostics` so the copied folder goes away with it.

Prefer a manual import? [`cosdi-diagnostics.zip`](https://github.com/vvda12061999/CosDI/releases/latest/download/cosdi-diagnostics.zip) is still attached to every release and works in **Extension → Extension Manager → Project**.

---

## 2. Quick start

Cocos does **not** compile parameter / constructor `@` decorators. Use field `@inject` on components, and `@injectable(Class)` on plain classes.

### Service

The class is the service. No interface or token required.

```ts
export class ExampleService {
    name = 'ExampleService';
}
```

### Interface as a service

Cocos erases `interface`, so an interface leaves no value behind to use as a DI key. Its **name** is the key instead, and the interface file stays a plain interface:

```ts
// IExampleService.ts
export interface IExampleService {
    name: string;
}
```

```ts
// ExampleService.ts
import { IExampleService } from './IExampleService';

export class ExampleService implements IExampleService {
    name = 'ExampleService';
}
```

Register the implementation under that name, and inject it the same way:

```ts
builder.register(ExampleService, Lifetime.Singleton).as('IExampleService');
```

```ts
@inject('IExampleService')
private exampleService: IExampleService;
```

Nothing is generated into your file, and you import the interface from wherever it lives, like any other type.

#### Keeping the keys typed

On its own, a key is a string, so `resolve` can only promise `object`. Run the **CosDI Codegen** extension and it writes one declaration file that gives every key its type:

```ts
// cosdi-service-keys.d.ts — generated, do not edit
import type { IExampleService as IExampleService_ } from './assets/Scripts/IExampleService';

declare module 'cosdi' {
    interface ServiceTypes {
        'IExampleService': IExampleService_;
    }
}
```

Nothing imports that file and it holds no runtime code; it sits outside `assets/`, so Creator never compiles it. What it buys you is the type:

```ts
const service = container.resolve('IExampleService'); // IExampleService, no cast
```

Keys the map has not seen still resolve, they just come back as `object`. Editors autocomplete the mapped ones inside `@inject('` and `resolve('`.

Turn it on with a `cosdi.codegen.json` in the project root:

```json
{ "mode": "keys", "include": "exported" }
```

`include: "exported"` maps every exported interface under `roots`, which is what keeps your files free of annotations. `include: "tagged"` (the default) maps only interfaces marked `/** @createToken */`, and `@createToken('Game.IExampleService')` sets the key. Generic interfaces are skipped either way, because each type argument would need a key of its own.

#### Tokens, when a string is not enough

A string key is a name, so renaming the interface does not rename its key, and two interfaces cannot share a name. When you would rather have a value the compiler tracks, `createToken` still makes one:

```ts
export interface IExampleService {
    name: string;
}
export const IExampleService = createToken<IExampleService>('IExampleService');
```

That is the trade: the token is refactor-safe and typed without a generated map, at the cost of a line in the file and an import wherever you use it. `IExampleService` is then the interface in type position and the token in value position, so one name works everywhere, and `resolve(IExampleService)` is typed because the token carries the type. `@createToken` on a class still works when you want a class to keep its own key.

The generator can write those tokens for you too. Tag the interface and pick where the token lands:

```ts
/** @createToken */
export interface IExampleService {
    name: string;
}
export const IExampleService = createToken<IExampleService>('IExampleService'); // cosdi:token
```

The `// cosdi:token` line is generated, so leave it alone and never write it yourself. Delete the tag and it goes away with it.

#### Generator settings

The generator is the **CosDI Codegen** editor extension in [`extensions/cosdi-codegen/`](extensions/cosdi-codegen). Copy that folder into your project's `extensions/` and restart Creator; it is not on npm yet. It runs when the extension loads, again on every `.ts` save, and on demand from **CosDI → Generate Interface Tokens**. Outside the editor, run it from your project root:

```bash
node extensions/cosdi-codegen/bin/cosdi-codegen.js           # write
node extensions/cosdi-codegen/bin/cosdi-codegen.js --check   # fail if stale, for CI
```

Every field of `cosdi.codegen.json` is optional:

```json
{
  "roots": ["assets/Scripts/Contracts"],
  "exclude": ["Vendor"],
  "mode": "keys",
  "include": "exported",
  "generateOnSave": true
}
```

`roots` and `exclude` keep the scan off the rest of the project. A save only revisits the file you saved, so hook cost does not grow with project size; the menu item and the CLI still sweep everything. `generateOnSave: false` turns off the save hook.

`mode` decides what is generated and where:

| Mode | What lands where | Used as |
| --- | --- | --- |
| `keys` | One `.d.ts` at `out`, outside `assets/`; sources untouched | `'IExampleService'` |
| `inline` (default) | A `// cosdi:token` line beside each interface | `IExampleService`, from its own file |
| `file` | One module at `out`, which must sit under `assets/` | `IExampleService`, from `./Tokens.generated` |
| `package` | A local package outside `assets/`, `node_modules/<packageName>` by default | `IExampleService`, from `'cosdi-tokens'` |

Use `package` to keep generated tokens out of the assets folder:

```json
{ "mode": "package", "packageName": "game-tokens" }
```

```ts
import { IExampleService } from 'game-tokens';
```

Creator resolves bare specifiers with the Node algorithm, which is how the `cosdi` package itself is imported, so a generated package works the same way. Two things to know: `npm install` wipes `node_modules`, and the generator rewrites the package on the next save or editor load. A path alias in `tsconfig.json` is not an alternative, because Creator does not read `tsconfig.json` when it compiles.

`file` and `package` mode export the interface type and its token under one name, and never write into your sources. In exchange, the file that declares an interface cannot import its own token — TypeScript rejects an import that collides with a local declaration — so keep tagged interfaces in their own files. Switching modes clears whatever the previous mode wrote.

### Register in a LifetimeScope

```ts
import { _decorator } from 'cc';
import { LifetimeScope, IContainerBuilder } from 'cosdi';
import { ExampleService } from './Example';

const { ccclass } = _decorator;

@ccclass('GameLifetimeScope')
export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(ExampleService);
    }
}
```

Add `GameLifetimeScope` to a node in the scene. `register` is a singleton unless you pass `Lifetime.Scoped` or `Lifetime.Transient`.

### Inject a component field

```ts
import { _decorator, Component } from 'cc';
import { inject } from 'cosdi';
import { ExampleService } from './Example';

const { ccclass } = _decorator;

@ccclass('Example')
export class Example extends Component {
    @inject(ExampleService)
    private exampleService: ExampleService;

    start() {
        console.log('Injected field', this.exampleService.name);
    }
}
```

### `new Player()` fills constructor deps

```ts
import { injectable } from 'cosdi';
import { ExampleService } from './Example';

@injectable(ExampleService)
export class Player {
    constructor(service?: ExampleService) {
        console.log('Player constructed with', service && service.name);
    }
}

const player = new Player();
```

Pass classes to `@injectable(...)` in constructor-argument order.

| Lifetime | Meaning |
| --- | --- |
| `Singleton` | One instance for the registration and child scopes |
| `Scoped` | One instance per scope |
| `Transient` | New instance every resolve |

---

## 3. Proof of concept

Play a scene that has a `LifetimeScope`. Components receive field injection, and `new Player()` is constructed with the registered service.

<p align="center">
  <img src="docs/images/poc-diagnostics.png" alt="CosDI running in Cocos Creator — Example injection logs and Diagnostics panel">
</p>

**CosDI Diagnostics** is a dockable editor tab (drag it next to Console) shipped in the `cosdi-diagnostics` package. Keep it open, press Play, and it shows the live scope tree. Open it from **Panel → CosDI Diagnostics**.

---

## 4. Benchmark

The suite mirrors VContainer’s `ContainerPerformanceTest` (`N = 10_000`, 10 samples, 3 warmup), plus heavier graphs.

Add **CosDIBenchmarkRunner** to a node and press Play. Results appear in Game View and in **Panel → CosDI Diagnostics**.

### Environment

Sample numbers below were taken on this setup. Your times will differ.

| Item | Value |
| --- | --- |
| Engine | Cocos Creator 3.8.8 |
| Mode | Preview in Editor |
| OS | Windows 11 Pro (build 26200) |
| CPU | Intel Core i7-14700K |
| RAM | 32 GB |
| Diagnostics | Off during the run (`CosDISettings.enableDiagnostics = false`) |

<p align="center">
  <img src="docs/images/benchmark.png" alt="CosDI benchmark results in Game View">
</p>

Sample results:

| Case | Group | Median | ns/op |
| --- | --- | ---: | ---: |
| ResolveSingleton | CosDI | 0.70 ms | 23 |
| ResolveTransient | CosDI | 1.50 ms | 50 |
| ResolveCombined | CosDI | 4.10 ms | 137 |
| ResolveCombined | Direct `new` | 0.60 ms | 20 |
| ResolveComplex | CosDI | 11.60 ms | 387 |
| ResolveComplex | Direct `new` | 2.40 ms | 80 |
| SpawnEnemy | CosDI | 4.30 ms | 430 |
| SpawnEnemy | Direct `new` | 0.70 ms | 70 |
| ContainerBuildComplex | CosDI | 71.75 ms | 7175 |

Singleton lookup is ~23 ns. Combined / Complex stay in the same order of magnitude as plain `new` (about 5–7×). Keep diagnostics off for timing runs; the tracer case is ~180× slower on purpose.

---

## 5. Notes

- Do not put `@` on constructor parameters.
- Do not put `@injectable()` on `Component` subclasses. Use field `@inject`.
- `CosDISettings.enableDiagnostics` defaults to `true` for the editor panel. Turn it off in shipping builds if you want zero tracer cost.

---

## 6. How to contribute

See **[CONTRIBUTING.md](CONTRIBUTING.md)**.

1. Fork and branch from `master`.
2. Edit `assets/CosDI/` (the `cosdi` runtime) or `extensions/cosdi-diagnostics/` (the `cosdi-diagnostics` editor panel).
3. Run `node scripts/test-diagnostics-install.js` after touching the install CLI, and `node scripts/pack-extension.js` to rebuild the release zip.
4. Open a pull request. Describe the change and how you tested it.

---

## 7. Bug reports

Open a **[Bug report](https://github.com/vvda12061999/CosDI/issues/new?template=bug_report.yml)** on GitHub.

Include Creator version, OS, CosDI version, steps to reproduce, expected vs actual, and logs or a screenshot.

Feature ideas: **[Feature request](https://github.com/vvda12061999/CosDI/issues/new?template=feature_request.yml)**.

---

## 8. How to support

See **[SUPPORT.md](SUPPORT.md)**.

- [⭐ Star the repo](https://github.com/vvda12061999/CosDI) so other Creator developers can find it
- [Buy Me a Coffee](https://buymeacoffee.com/vvda1206) if you want to support development

<p align="center">
  <a href="https://buymeacoffee.com/vvda1206">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50">
  </a>
</p>
