#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { buildRuntime } = require('./build-runtime-test.js');

const compiled = buildRuntime();
const runtime = require(path.join(compiled, 'index.js'));
const { addMethodParam } = require(path.join(compiled, 'Internal', 'InjectMetadata.js'));
const {
    ContainerBuilder,
    CosDIException,
    CosDIResolutionException,
    DiagnosticsContext,
    Lifetime,
    createToken,
    inject,
    injectable,
    key,
    resolutionTree,
} = runtime;

let failures = 0;

function check(name, fn) {
    try {
        fn();
        console.log('ok   ' + name);
    } catch (error) {
        failures += 1;
        console.error('FAIL ' + name + ': ' + (error && error.stack ? error.stack.split('\n').slice(0, 6).join('\n') : error));
    }
}

/** Runs `fn` and hands back whatever it threw. */
function thrown(fn) {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return null;
}

check('a missing dependency names every class between the resolve and the gap', () => {
    const IAudio = createToken('IAudio');
    class Inventory {
        constructor(audio) {
            this.audio = audio;
        }
    }
    injectable(IAudio)(Inventory);
    class Player {
        constructor(inventory) {
            this.inventory = inventory;
        }
    }
    injectable(Inventory)(Player);
    class Entry {}
    inject(Player)(Entry.prototype, 'player');

    const builder = new ContainerBuilder();
    builder.validateOnBuild = false;
    builder.register(Entry, Lifetime.Singleton);
    builder.register(Player, Lifetime.Transient);
    builder.register(Inventory, Lifetime.Singleton);

    const error = thrown(() => builder.build().resolve(Entry));
    assert.ok(error instanceof CosDIResolutionException, 'a resolution failure');
    assert.match(error.message, /Nothing registers IAudio\./);
    assert.match(error.message, /Entry\n {4}field 'player' -> Player/);
    assert.match(error.message, /constructor parameter 'inventory' -> Inventory/);
    assert.match(error.message, /constructor parameter 'audio' -> IAudio \(nothing registers it\)/);
    assert.strictEqual(error.missingType, IAudio);
    assert.deepStrictEqual(error.path.map((step) => step.site), [
        "field 'player'",
        "constructor parameter 'inventory'",
        "constructor parameter 'audio'",
    ]);
});

check('the message and the stack say the same thing', () => {
    class Hud {}
    inject('INothing')(Hud.prototype, 'nothing');

    const builder = new ContainerBuilder();
    builder.validateOnBuild = false;
    builder.register(Hud, Lifetime.Singleton);

    const error = thrown(() => builder.build().resolve(Hud));
    assert.match(error.message, /Hud\n {4}field 'nothing' -> INothing/);
    assert.ok(error.stack.startsWith('CosDIResolutionException: ' + error.message), error.stack.slice(0, 200));
    assert.match(error.stack, /at .*Container/, 'the frames survive');
});

check('a method injection failure names the method and the parameter', () => {
    class Late {
        setup(audio) {
            this.audio = audio;
        }
    }
    addMethodParam(Late, 'setup', { index: 0, name: 'audio', token: 'IAudioLate' });

    const builder = new ContainerBuilder();
    builder.validateOnBuild = false;
    builder.register(Late, Lifetime.Singleton);

    const error = thrown(() => builder.build().resolve(Late));
    assert.match(error.message, /Late\n {4}method 'setup' parameter 'audio' -> IAudioLate/);
});

check('a near name is offered when the key looks like a typo', () => {
    class PlayerService {}
    const builder = new ContainerBuilder();
    builder.register(PlayerService, Lifetime.Singleton).as('IPlayerService');

    const error = thrown(() => builder.build().resolve('IPlayerServcie'));
    assert.match(error.message, /Did you mean/);
    assert.match(error.message, /IPlayerService/);
    assert.match(error.message, /builder\.register\(\.\.\.\)\.as\('IPlayerServcie'\)/);
});

check('a name nothing resembles is not guessed at', () => {
    class PlayerService {}
    const builder = new ContainerBuilder();
    builder.register(PlayerService, Lifetime.Singleton).as('IPlayerService');

    const error = thrown(() => builder.build().resolve('IAudioMixer'));
    assert.doesNotMatch(error.message, /Did you mean/);
    assert.match(error.message, /ask with tryResolve/);
});

check('a key that is only registered under a key of its own says so', () => {
    class Music {}
    const builder = new ContainerBuilder();
    builder.register(Music, Lifetime.Singleton).keyed('music');

    const error = thrown(() => builder.build().resolve(Music));
    assert.match(error.message, /Music is registered, but only with key 'music'/);
    assert.match(error.message, /resolve\(Music, 'music'\)/);
});

check('asking with a key for something registered without one says so', () => {
    class Music {}
    const builder = new ContainerBuilder();
    builder.register(Music, Lifetime.Singleton);

    const error = thrown(() => builder.build().resolve(Music, 'music'));
    assert.match(error.message, /Nothing registers Music with key 'music'/);
    assert.match(error.message, /registered without a key/);
});

check('the wrong key names the keys that are registered', () => {
    class Music {}
    const builder = new ContainerBuilder();
    builder.register(Music, Lifetime.Singleton).keyed('menu');

    const error = thrown(() => builder.build().resolve(Music, 'level'));
    assert.match(error.message, /registered with key 'menu', not 'level'/);
});

check('a scope says how far it looked', () => {
    const builder = new ContainerBuilder();
    const container = builder.build();
    const scope = container.createScope((child) => child.validateOnBuild = false);
    const inner = scope.createScope();

    assert.match(thrown(() => container.resolve('IGone')).message, /Looked in this container/);
    assert.match(thrown(() => inner.resolve('IGone')).message, /Looked in this scope and the 2 scopes above it/);
});

check('a keyed field failure keeps the key in the message', () => {
    class Hud {}
    inject('IAudio')(Hud.prototype, 'audio');
    key('menu')(Hud.prototype, 'audio');

    const builder = new ContainerBuilder();
    builder.validateOnBuild = false;
    builder.register(Hud, Lifetime.Singleton);

    const error = thrown(() => builder.build().resolve(Hud));
    assert.match(error.message, /Nothing registers IAudio with key 'menu'/);
    assert.strictEqual(error.missingKey, 'menu');
});

check('a constructor that throws keeps its own error and gains the walk', () => {
    class Config {
        constructor() {
            throw new RangeError('config.json is missing');
        }
    }
    injectable()(Config);
    class Boot {}
    inject(Config)(Boot.prototype, 'config');

    const builder = new ContainerBuilder();
    builder.register(Boot, Lifetime.Singleton);
    builder.register(Config, Lifetime.Singleton);

    const error = thrown(() => builder.build().resolve(Boot));
    assert.ok(error instanceof RangeError, 'the constructor keeps its own error');
    assert.strictEqual(error.message, 'config.json is missing', 'the message is left alone');
    assert.match(error.stack, /RangeError: config\.json is missing/);
    assert.match(error.stack, /CosDI was resolving:\n {2}Boot\n {4}field 'config' -> Config\n {6}constructor <- threw here/);
});

check('a factory that throws says which registration it was for', () => {
    const IWorld = createToken('IWorld');
    const builder = new ContainerBuilder();
    builder.registerFactory(IWorld, () => {
        throw new Error('the save file is empty');
    }, Lifetime.Singleton);

    const error = thrown(() => builder.build().resolve(IWorld));
    assert.strictEqual(error.message, 'the save file is empty');
    assert.match(error.stack, /CosDI was resolving:\n {2}IWorld\n {4}factory <- threw here/);
});

check('a loop that only shows up at runtime is named, and the walk is cut short', () => {
    class Left {
        constructor(right) {
            this.right = right;
        }
    }
    class Right {
        constructor(left) {
            this.left = left;
        }
    }
    injectable(Right)(Left);
    injectable(Left)(Right);

    const builder = new ContainerBuilder();
    // A factory is the one way past build(), which reports loops it can see.
    builder.registerFactory(Left, (resolver) => new Left(resolver.resolve(Right)), Lifetime.Transient);
    builder.register(Right, Lifetime.Transient);

    const started = Date.now();
    const error = thrown(() => builder.build().resolve(Left));
    const elapsed = Date.now() - started;

    assert.ok(error instanceof RangeError, 'the stack overflows');
    assert.match(error.stack, /comes round twice, so this is a circular dependency/);
    assert.match(error.stack, /\.\.\. \d+ more above/);
    assert.ok(error.stack.split('\n').length < 40, 'the walk is cut short');
    assert.ok(elapsed < 2000, `unwinding took ${elapsed}ms`);
});

check('a bare @inject with nothing to go on still says where it is', () => {
    class Hud {}
    inject()(Hud.prototype, 'nothingIsCalledThis');

    const builder = new ContainerBuilder();
    builder.validateOnBuild = false;
    builder.register(Hud, Lifetime.Singleton);

    const error = thrown(() => builder.build().resolve(Hud));
    assert.ok(error instanceof CosDIException, 'a CosDI failure');
    assert.match(error.message, /has nothing to go on/);
    assert.match(error.stack, /CosDI was resolving:\n {2}Hud\n {4}field 'nothingIsCalledThis'/);
});

check('tryResolve stays quiet, and costs nothing to say nothing', () => {
    const builder = new ContainerBuilder();
    const container = builder.build();
    assert.strictEqual(container.tryResolve('INothing'), null);
    assert.deepStrictEqual(container.resolveAll('INothing'), []);
});

check('the tree is drawn the same way wherever it is read from', () => {
    const tree = resolutionTree([
        { type: 'Entry', site: "field 'player'" },
        { type: 'Player', site: "constructor parameter 'audio'" },
    ], 'IAudio (nothing registers it)');
    assert.strictEqual(tree, [
        '  Entry',
        "    field 'player' -> Player",
        "      constructor parameter 'audio' -> IAudio (nothing registers it)",
    ].join('\n'));
    assert.strictEqual(resolutionTree([], 'IAudio'), '');
});

check('failed resolves reach the diagnostics snapshot the panel reads', () => {
    class Hud {}
    inject('IAudio')(Hud.prototype, 'audio');

    const builder = new ContainerBuilder();
    builder.validateOnBuild = false;
    builder.diagnostics = DiagnosticsContext.getCollector('FailureScope');
    builder.register(Hud, Lifetime.Singleton);
    const container = builder.build();

    assert.ok(thrown(() => container.resolve(Hud)));
    assert.ok(thrown(() => container.resolve('IAlsoGone')));

    const snapshot = DiagnosticsContext.toJSON();
    const scope = snapshot.scopes.filter((one) => one.scopeName === 'FailureScope')[0];
    assert.strictEqual(scope.failures.length, 2);
    assert.match(scope.failures[0].message, /CosDIResolutionException: Nothing registers/);
    assert.ok(scope.failures.some((failure) => /field 'audio' -> IAudio/.test(failure.message)),
        'the walk is kept, not just the first line');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(scope.failures)), scope.failures);

    DiagnosticsContext.removeCollector('FailureScope');
});

check('the same failure over and over is collapsed, not piled up', () => {
    class Hud {}
    inject('IAudio')(Hud.prototype, 'audio');

    const builder = new ContainerBuilder();
    builder.validateOnBuild = false;
    builder.diagnostics = DiagnosticsContext.getCollector('RepeatScope');
    builder.register(Hud, Lifetime.Transient);
    const container = builder.build();

    for (let i = 0; i < 50; i++) {
        thrown(() => container.resolve(Hud));
    }

    const failures = DiagnosticsContext.getCollector('RepeatScope').getFailures();
    assert.strictEqual(failures.length, 1);
    assert.ok(failures[0].count > 1, 'the repeats are counted');
    DiagnosticsContext.removeCollector('RepeatScope');
});

check('a failure halfway down leaves the next resolve reading straight', () => {
    class Missing {}
    inject('IGoneForever')(Missing.prototype, 'gone');
    class Fine {}

    const builder = new ContainerBuilder();
    builder.validateOnBuild = false;
    builder.diagnostics = DiagnosticsContext.getCollector('UnwindScope');
    builder.register(Missing, Lifetime.Transient);
    builder.register(Fine, Lifetime.Transient);
    const container = builder.build();

    thrown(() => container.resolve(Missing));
    container.resolve(Fine);

    const snapshot = DiagnosticsContext.toJSON();
    const scope = snapshot.scopes.filter((one) => one.scopeName === 'UnwindScope')[0];
    const fine = scope.registrations.filter((one) => one.type === 'Fine')[0];
    assert.strictEqual(fine.maxDepth, 0, 'Fine is resolved at the top, not under the failure');
    DiagnosticsContext.removeCollector('UnwindScope');
});

check('the diagnostics panel draws the failures a snapshot carries', () => {
    const panel = loadPanel();
    const html = panel.renderFailures([
        { message: "CosDIResolutionException: Nothing registers IAudio.\n\n  Hud\n    field 'audio' -> IAudio", count: 3, at: 1 },
    ]);
    assert.match(html, /1 failed resolve/);
    assert.match(html, /Nothing registers IAudio/);
    assert.match(html, /field 'audio'/);
    assert.match(html, /x3/);
    assert.strictEqual(panel.renderFailures([]), '');
    assert.strictEqual(panel.renderFailures(undefined), '');
});

/** Loads the editor panel outside the editor, with its helpers reachable. */
function loadPanel() {
    const fs = require('fs');
    const Module = require('module');
    const file = path.join(__dirname, '..', 'extensions', 'cosdi-diagnostics', 'panels', 'default.js');
    const source = fs.readFileSync(file, 'utf8') + '\nmodule.exports.renderFailures = renderFailures;\n';

    const previousEditor = global.Editor;
    global.Editor = { Panel: { define: (definition) => definition } };
    try {
        const loaded = new Module(file, null);
        loaded.filename = file;
        loaded.paths = Module._nodeModulePaths(path.dirname(file));
        loaded._compile(source, file);
        return loaded.exports;
    } finally {
        global.Editor = previousEditor;
    }
}

if (failures > 0) {
    console.error(failures + ' error diagnostics test(s) failed');
    process.exit(1);
}
console.log('error diagnostics tests passed');
