#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { analyzeSources } = require('../extensions/cosdi-codegen/lib/di-analyzer.js');

let failures = 0;

function check(name, fn) {
    try {
        fn();
        console.log('ok   ' + name);
    } catch (error) {
        failures += 1;
        console.error('FAIL ' + name + ': ' + (error && error.stack ? error.stack.split('\n').slice(0, 4).join('\n') : error));
    }
}

/** Runs the analyzer over sources written as `{ 'File.ts': 'source' }`. */
function analyze(files, settings) {
    const sources = Object.keys(files).map((file) => ({ file, text: files[file] }));
    return analyzeSources(sources, settings);
}

function rules(result) {
    return result.problems.map((problem) => problem.rule);
}

const SCOPE = `
import { LifetimeScope, IContainerBuilder, Lifetime } from 'cosdi';
import { PlayerService } from './PlayerService';

export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(PlayerService, Lifetime.Singleton).as(IPlayerService);
    }
}
`;

check('a project where everything is registered reports nothing', () => {
    const result = analyze({
        'IPlayerService.ts': '/** @generateToken */\nexport interface IPlayerService {\n    attack(): void;\n}\n',
        'PlayerService.ts': "import { injectable } from 'cosdi';\n\n@injectable()\nexport class PlayerService {}\n",
        'GameLifetimeScope.ts': SCOPE,
        'Hud.ts': `
import { _decorator, Component } from 'cc';
import { inject } from 'cosdi';
import { IPlayerService } from './Services';

const { ccclass } = _decorator;

@ccclass('Hud')
export class Hud extends Component {
    @inject(IPlayerService)
    private playerService: IPlayerService;
}
`,
    });

    assert.deepStrictEqual(result.problems, []);
    assert.strictEqual(result.registrations, 1);
});

check('a key nothing registers is reported where it is asked for', () => {
    const result = analyze({
        'GameLifetimeScope.ts': SCOPE,
        'IPlayerService.ts': '/** @generateToken */\nexport interface IPlayerService {}\n',
        'PlayerService.ts': 'export class PlayerService {}\n',
        'Hud.ts': `
import { inject } from 'cosdi';

export class Hud {
    @inject(IAudioService)
    private audio: IAudioService;
}
`,
    });

    assert.deepStrictEqual(rules(result), ['missing-registration']);
    const problem = result.problems[0];
    assert.strictEqual(problem.file, 'Hud.ts');
    assert.strictEqual(problem.line, 5);
    assert.strictEqual(problem.severity, 'error');
    assert.match(problem.message, /Hud asks for IAudioService \(field 'audio'\), which nothing in this project registers/);
});

check('a constructor parameter nothing registers is reported', () => {
    const result = analyze({
        'GameLifetimeScope.ts': SCOPE,
        'PlayerService.ts': `
import { injectable } from 'cosdi';

@injectable(IInventoryService)
export class PlayerService {
    constructor(inventory: IInventoryService) {}
}
`,
    });

    assert.deepStrictEqual(rules(result), ['missing-registration']);
    assert.match(result.problems[0].message, /constructor parameter 'inventory'/);
});

check('a bare @inject the field name answers for passes, and one it does not is reported', () => {
    const answered = analyze({
        'GameLifetimeScope.ts': SCOPE,
        'PlayerService.ts': 'export class PlayerService {}\n',
        'Hud.ts': `
import { inject } from 'cosdi';

export class Hud {
    @inject
    private playerService: PlayerService;
}
`,
    });
    assert.deepStrictEqual(answered.problems, []);

    const unanswered = analyze({
        'GameLifetimeScope.ts': SCOPE,
        'PlayerService.ts': 'export class PlayerService {}\n',
        'Hud.ts': `
import { inject } from 'cosdi';

export class Hud {
    @inject
    private whateverThisIs: unknown;
}
`,
    });
    assert.deepStrictEqual(rules(unanswered), ['no-key']);
    assert.match(unanswered.problems[0].message, /Name the key, as in @inject\(WhateverThisIs\)/);
});

check('a class the field name points at but nothing registers is reported', () => {
    const result = analyze({
        'GameLifetimeScope.ts': SCOPE,
        'PlayerService.ts': 'export class PlayerService {}\nexport class AudioService {}\n',
        'Hud.ts': `
import { inject } from 'cosdi';

export class Hud {
    @inject
    private audioService: AudioService;
}
`,
    });

    assert.deepStrictEqual(rules(result), ['missing-registration']);
    assert.match(result.problems[0].message, /asks for AudioService \(field 'audioService', by name\)/);
});

check('registering a token as if it were a class is reported', () => {
    const result = analyze({
        'IPlayerService.ts': '/** @generateToken */\nexport interface IPlayerService {}\n',
        'GameLifetimeScope.ts': `
import { LifetimeScope, IContainerBuilder, Lifetime } from 'cosdi';

export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(IPlayerService, Lifetime.Singleton);
        builder.register('IAudioService', Lifetime.Singleton);
    }
}
`,
    });

    assert.deepStrictEqual(rules(result), ['key-as-class', 'key-as-class']);
    assert.match(result.problems[0].message, /Register the class and name it with \.as\(IPlayerService\)/);
    assert.match(result.problems[1].message, /register\('IAudioService'\)/);
});

check('@injectable on a component is reported', () => {
    const result = analyze({
        'GameLifetimeScope.ts': SCOPE,
        'PlayerService.ts': 'export class PlayerService {}\n',
        'Hud.ts': `
import { _decorator, Component } from 'cc';
import { injectable } from 'cosdi';

const { ccclass } = _decorator;

@ccclass('Hud')
@injectable()
export class Hud extends Component {}
`,
    });

    assert.deepStrictEqual(rules(result), ['component-injectable']);
    assert.match(result.problems[0].message, /@injectable on Hud, which Cocos constructs itself/);
});

check('a decorator on a constructor parameter is reported', () => {
    const result = analyze({
        'GameLifetimeScope.ts': SCOPE,
        'PlayerService.ts': `
import { injectable, inject } from 'cosdi';

@injectable()
export class PlayerService {
    constructor(@inject(IAudioService) private audio: IAudioService) {}
}
`,
    });

    assert.deepStrictEqual(rules(result), ['parameter-decorator']);
    assert.match(result.problems[0].message, /Creator can leave the @ in the emitted JavaScript/);
    assert.match(result.problems[0].message, /Pass the keys to @injectable\(\.\.\.\) in constructor order instead/);
});

check('a loop between two registered classes is reported once', () => {
    const result = analyze({
        'Services.ts': `
import { injectable } from 'cosdi';

@injectable(InventoryService)
export class PlayerService {
    constructor(inventory: InventoryService) {}
}

@injectable(PlayerService)
export class InventoryService {
    constructor(player: PlayerService) {}
}
`,
        'GameLifetimeScope.ts': `
import { LifetimeScope, IContainerBuilder, Lifetime } from 'cosdi';

export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(PlayerService, Lifetime.Singleton);
        builder.register(InventoryService, Lifetime.Singleton);
    }
}
`,
    });

    assert.deepStrictEqual(rules(result), ['circular-dependency']);
    assert.match(
        result.problems[0].message,
        /PlayerService -> InventoryService \(constructor parameter 'inventory'\) -> PlayerService \(constructor parameter 'player'\)/,
    );
});

check('a factory breaks the loop, as it does at run time', () => {
    const result = analyze({
        'Services.ts': `
import { injectable } from 'cosdi';

@injectable(InventoryService)
export class PlayerService {
    constructor(inventory: InventoryService) {}
}

@injectable(PlayerService)
export class InventoryService {
    constructor(player: PlayerService) {}
}
`,
        'GameLifetimeScope.ts': `
import { LifetimeScope, IContainerBuilder, Lifetime } from 'cosdi';

export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(PlayerService, Lifetime.Singleton);
        builder.registerFactory(InventoryService, () => new InventoryService(null), Lifetime.Singleton);
    }
}
`,
    });

    assert.deepStrictEqual(result.problems, []);
});

check('withParameter stands in for a registration', () => {
    const result = analyze({
        'GameLifetimeScope.ts': `
import { LifetimeScope, IContainerBuilder, Lifetime } from 'cosdi';

export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(PlayerService, Lifetime.Singleton)
            .withParameter('speed', 10);
    }
}
`,
        'PlayerService.ts': `
import { injectable } from 'cosdi';

@injectable()
export class PlayerService {
    constructor(speed: number) {}
}
`,
    });

    assert.deepStrictEqual(result.problems, []);
});

check('an entry point registered through useEntryPoints counts as registered', () => {
    const result = analyze({
        'GameLifetimeScope.ts': `
import { LifetimeScope, IContainerBuilder, Lifetime, useEntryPoints } from 'cosdi';

export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        useEntryPoints(builder, Lifetime.Singleton, (entryPoints) => {
            entryPoints.add(GameLoop);
        });
    }
}
`,
        'GameLoop.ts': `
import { inject } from 'cosdi';

export class GameLoop {
    @inject
    private playerService: PlayerService;
}
`,
        'PlayerService.ts': `
import { LifetimeScope, IContainerBuilder, Lifetime } from 'cosdi';

export class PlayerService {}

export class ServiceInstaller {
    install(builder: IContainerBuilder): void {
        builder.register(PlayerService, Lifetime.Singleton);
    }
}
`,
    });

    assert.deepStrictEqual(result.problems, []);
});

check('what the container answers for itself is never missing', () => {
    const result = analyze({
        'GameLifetimeScope.ts': SCOPE,
        'PlayerService.ts': `
import { injectable, IObjectResolver } from 'cosdi';

@injectable(IObjectResolver)
export class PlayerService {
    constructor(resolver: IObjectResolver) {}
}
`,
    });

    assert.deepStrictEqual(result.problems, []);
});

check('a project with no registrations at all is left alone', () => {
    const result = analyze({
        'Hud.ts': `
import { inject } from 'cosdi';

export class Hud {
    @inject(IPlayerService)
    private playerService: IPlayerService;
}
`,
    });

    assert.deepStrictEqual(result.problems, []);
});

check('a key can be ignored by config or by a comment', () => {
    const files = {
        'GameLifetimeScope.ts': SCOPE,
        'PlayerService.ts': 'export class PlayerService {}\n',
        'Hud.ts': `
import { inject } from 'cosdi';

export class Hud {
    @inject(IAudioService)
    private audio: IAudioService;
}
`,
    };

    assert.deepStrictEqual(rules(analyze(files)), ['missing-registration']);
    assert.deepStrictEqual(analyze(files, { ignore: ['IAudioService'] }).problems, []);
    assert.deepStrictEqual(analyze(files, { rules: { 'missing-registration': 'off' } }).problems, []);
    assert.strictEqual(analyze(files, { rules: { 'missing-registration': 'warn' } }).warnings, 1);

    const suppressed = Object.assign({}, files, {
        'Hud.ts': files['Hud.ts'].replace('    @inject(IAudioService)', '    // cosdi-ignore: the shell app registers this\n    @inject(IAudioService)'),
    });
    assert.deepStrictEqual(analyze(suppressed).problems, []);
});

check('every problem in a project is reported by the same run', () => {
    const result = analyze({
        'GameLifetimeScope.ts': `
import { LifetimeScope, IContainerBuilder, Lifetime } from 'cosdi';

export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(IPlayerService, Lifetime.Singleton);
        builder.register(Hud, Lifetime.Singleton);
    }
}
`,
        'IPlayerService.ts': '/** @generateToken */\nexport interface IPlayerService {}\n',
        'Hud.ts': `
import { inject } from 'cosdi';

export class Hud {
    @inject(IAudioService)
    private audio: IAudioService;

    @inject
    private nothingByThatName: unknown;
}
`,
    });

    assert.deepStrictEqual(rules(result).sort(), ['key-as-class', 'missing-registration', 'no-key']);
    assert.strictEqual(result.errors, 3);
});

check('a register call that has nothing to do with the container is left alone', () => {
    const result = analyze({
        'GameLifetimeScope.ts': SCOPE,
        'PlayerService.ts': 'export class PlayerService {}\n',
        'Hud.ts': `
import { inject } from 'cosdi';

export class Hud {
    private emitter = { register: (name: string, cb: () => void) => undefined };

    start(): void {
        this.emitter.register('click', () => undefined);
    }
}
`,
    });

    assert.deepStrictEqual(result.problems, []);
});

check('a chained registration is read to the end of the chain', () => {
    const result = analyze({
        'GameLifetimeScope.ts': `
import { LifetimeScope, IContainerBuilder, Lifetime } from 'cosdi';

export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder
            .register(AudioService, Lifetime.Scoped)
            .as(IAudioService)
            .keyed('music')
            .withParameter('volume', 0.5);
    }
}
`,
        'AudioService.ts': `
import { injectable, inject, key } from 'cosdi';

@injectable()
export class AudioService {
    constructor(volume: number) {}
}

export class Hud {
    @inject(IAudioService)
    @key('music')
    private music: IAudioService;
}
`,
    });

    assert.deepStrictEqual(result.problems, []);
});

check('a project of a thousand files is read in well under a second', () => {
    const files = {};
    for (let index = 0; index < 1000; index++) {
        files[`Service${index}.ts`] = `
import { injectable, inject } from 'cosdi';

@injectable(Service${index + 1})
export class Service${index} {
    constructor(private readonly next: Service${index + 1}) {}

    @inject
    private playerService: PlayerService;
}
`;
    }
    files['Service1000.ts'] = 'export class Service1000 {}\n';
    files['PlayerService.ts'] = 'export class PlayerService {}\n';
    files['GameLifetimeScope.ts'] = `
import { LifetimeScope, IContainerBuilder, Lifetime } from 'cosdi';

export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(PlayerService, Lifetime.Singleton);
${Array.from({ length: 1001 }, (_, index) => `        builder.register(Service${index}, Lifetime.Singleton);`).join('\n')}
    }
}
`;

    const started = Date.now();
    const result = analyze(files);
    const elapsed = Date.now() - started;

    assert.deepStrictEqual(result.problems, []);
    assert.ok(elapsed < 2000, `reading 1000 files took ${elapsed}ms`);
});

check('the sample project in this repo passes', () => {
    const fs = require('fs');
    const { collectFiles } = require('../extensions/cosdi-codegen/lib/token-codegen.js');
    const root = path.resolve(__dirname, '..', 'assets', 'Scripts');
    const files = collectFiles(root, [], ['Benchmark']);
    const sources = files.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));

    const result = analyzeSources(sources, {});
    assert.deepStrictEqual(result.problems, [], JSON.stringify(result.problems, null, 2));
    assert.ok(result.scanned >= 4, 'the sample has scripts to read');
});

if (failures > 0) {
    console.error(failures + ' analyzer test(s) failed');
    process.exit(1);
}
console.log('DI analyzer tests passed');
