#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { buildRuntime } = require('./build-runtime-test.js');

const compiled = buildRuntime();
const runtime = require(path.join(compiled, 'index.js'));
const { addMethodParam } = require(path.join(compiled, 'Internal', 'InjectMetadata.js'));
const { COLLECTION_ANY_KEY } = require(path.join(compiled, 'Internal', 'InstanceProviders.js'));
const {
    ContainerBuilder,
    DependencyGraph,
    DiagnosticsContext,
    Lifetime,
    createToken,
    dependencyGraphMermaid,
    dependencyGraphText,
    inject,
    injectable,
    key,
    typeKeyName,
    validateGraph,
} = runtime;

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

/** The graph of what was registered, whether or not the build would pass. */
function graphOf(configure) {
    const builder = new ContainerBuilder();
    configure(builder);
    return builder.dependencyGraph();
}

function node(graph, name) {
    const found = graph.nodes.filter((n) => n.name === name);
    assert.strictEqual(found.length, 1, `expected one node named ${name}, found ${found.length}`);
    return found[0];
}

function edge(graph, name, site) {
    const found = node(graph, name).edges.filter((e) => e.site === site);
    assert.strictEqual(found.length, 1, `expected one edge at ${site} on ${name}`);
    return found[0];
}

const ILogger = createToken('IGraphLogger');

class Logger {}

check('every registration is a node, with its lifetime, contract and source', () => {
    class Clock {}
    const graph = graphOf((builder) => {
        builder.register(Logger, Lifetime.Singleton).as(ILogger);
        builder.registerInstance(new Clock());
        builder.registerFactory('GraphMadeSave', () => ({}), Lifetime.Transient);
    });

    const registered = node(graph, 'Logger');
    assert.strictEqual(registered.lifetime, Lifetime.Singleton);
    assert.strictEqual(registered.source, 'class');
    assert.deepStrictEqual(registered.contracts.map(typeKeyName), ['IGraphLogger']);

    assert.strictEqual(node(graph, 'Clock').source, 'instance');
    assert.strictEqual(node(graph, 'GraphMadeSave').source, 'factory');
    assert.strictEqual(node(graph, 'IObjectResolver').source, 'container');
    assert.strictEqual(graph.nodes.length, 4);
});

check('a constructor parameter, a field and a method parameter each become an edge', () => {
    class Inventory {}
    class Player {
        constructor(logger) {
            this.logger = logger;
        }
    }
    injectable(ILogger)(Player);
    inject(Inventory)(Player.prototype, 'inventory');
    addMethodParam(Player, 'reset', { index: 0, name: 'logger', token: ILogger });

    const graph = graphOf((builder) => {
        builder.register(Logger, Lifetime.Singleton).as(ILogger);
        builder.register(Inventory, Lifetime.Singleton);
        builder.register(Player, Lifetime.Transient);
    });

    const player = node(graph, 'Player');
    assert.deepStrictEqual(player.edges.map((e) => e.kind), ['parameter', 'field', 'method']);
    assert.deepStrictEqual(player.edges.map((e) => e.site), [
        "constructor parameter 'logger'",
        "field 'inventory'",
        "reset() parameter 'logger'",
    ]);
    for (const one of player.edges) {
        assert.strictEqual(one.status, 'local');
        assert.strictEqual(one.targets.length, 1);
    }
    assert.strictEqual(player.edges[1].targets[0], node(graph, 'Inventory'));
});

check('who asks for a node is recorded, and the roots are what nothing asks for', () => {
    class Menu {
        constructor(logger) {
            this.logger = logger;
        }
    }
    class Hud {
        constructor(logger) {
            this.logger = logger;
        }
    }
    injectable(ILogger)(Menu);
    injectable(ILogger)(Hud);

    const graph = graphOf((builder) => {
        builder.register(Logger, Lifetime.Singleton).as(ILogger);
        builder.register(Menu, Lifetime.Singleton);
        builder.register(Hud, Lifetime.Singleton);
    });

    assert.deepStrictEqual(node(graph, 'Logger').dependents.map((n) => n.name).sort(), ['Hud', 'Menu']);
    assert.deepStrictEqual(graph.roots.map((n) => n.name).sort(), ['Hud', 'IObjectResolver', 'Menu']);
    assert.deepStrictEqual(
        graph.reachableFrom(node(graph, 'Menu')).map((n) => n.name),
        ['Logger'],
    );
});

check('an edge nothing registers is missing, and one with no key at all is keyless', () => {
    class Wanting {
        constructor(logger) {
            this.logger = logger;
        }
    }
    injectable(ILogger)(Wanting);
    inject(Wanting.prototype, 'nothingGoesByThisName');

    const graph = graphOf((builder) => {
        builder.register(Wanting, Lifetime.Singleton);
    });

    const missing = edge(graph, 'Wanting', "constructor parameter 'logger'");
    assert.strictEqual(missing.status, 'missing');
    assert.deepStrictEqual(missing.targets, []);
    assert.strictEqual(missing.token, ILogger);

    const keyless = edge(graph, 'Wanting', "field 'nothingGoesByThisName'");
    assert.strictEqual(keyless.status, 'keyless');
    assert.strictEqual(keyless.token, undefined);

    assert.deepStrictEqual(validateGraph(graph).map((problem) => problem.kind), ['missing', 'keyless']);
});

check('what a parent scope registers is listed as a parent node, not as missing', () => {
    class Session {}
    class Popup {
        constructor(session) {
            this.session = session;
        }
    }
    injectable(Session)(Popup);

    const builder = new ContainerBuilder();
    builder.register(Session, Lifetime.Singleton);
    const container = builder.build();
    const scope = container.createScope((child) => child.register(Popup, Lifetime.Scoped));

    const graph = scope.dependencyGraph;
    const session = node(graph, 'Session');
    assert.strictEqual(session.scope, 'parent');
    assert.deepStrictEqual(session.edges, []);
    assert.strictEqual(node(graph, 'Popup').scope, 'local');

    const asked = edge(graph, 'Popup', "constructor parameter 'session'");
    assert.strictEqual(asked.status, 'parent');
    assert.strictEqual(asked.targets[0], session);
    assert.deepStrictEqual(validateGraph(graph), []);
});

check('an edge that asks for every implementation lands on all of them', () => {
    const IEnemy = createToken('IGraphEnemy');
    class Slime {}
    class Bat {}
    class Spawner {}
    // The whole collection, the way resolveAll asks for it.
    inject(IEnemy)(Spawner.prototype, 'enemies');
    key(COLLECTION_ANY_KEY)(Spawner.prototype, 'enemies');

    const graph = graphOf((builder) => {
        builder.register(Slime, Lifetime.Transient).as(IEnemy);
        builder.register(Bat, Lifetime.Transient).as(IEnemy);
        builder.register(Spawner, Lifetime.Singleton);
    });

    const asked = edge(graph, 'Spawner', "field 'enemies'");
    assert.strictEqual(asked.status, 'local');
    assert.deepStrictEqual(asked.targets.map((n) => n.name), ['Slime', 'Bat']);
    assert.deepStrictEqual(node(graph, 'Bat').dependents.map((n) => n.name), ['Spawner']);
});

check('a loop is listed with what it runs through and where it asks', () => {
    const IWorld = createToken('IGraphWorld');
    const IClock = createToken('IGraphClock');
    class World {
        constructor(clock) {
            this.clock = clock;
        }
    }
    class Clock {
        constructor(world) {
            this.world = world;
        }
    }
    injectable(IClock)(World);
    injectable(IWorld)(Clock);

    const graph = graphOf((builder) => {
        builder.register(World, Lifetime.Singleton).as(IWorld);
        builder.register(Clock, Lifetime.Singleton).as(IClock);
    });

    assert.strictEqual(graph.cycles.length, 1);
    const cycle = graph.cycles[0];
    assert.deepStrictEqual(cycle.nodes.map((n) => n.name), ['World', 'Clock', 'World']);
    assert.deepStrictEqual(cycle.edges.map((e) => e.site), [
        "constructor parameter 'clock'",
        "constructor parameter 'world'",
    ]);
    assert.deepStrictEqual(validateGraph(graph).map((problem) => problem.kind), ['cycle']);
});

check('the graph a container was built with is the container it was built for', () => {
    class Standalone {}
    const builder = new ContainerBuilder();
    builder.register(Standalone, Lifetime.Singleton);
    const container = builder.build();

    assert.ok(container.dependencyGraph instanceof DependencyGraph);
    assert.strictEqual(container.dependencyGraph.find(Standalone).name, 'Standalone');
    assert.strictEqual(container.dependencyGraph.find(class Unregistered {}), null);

    const scope = container.createScope(null);
    assert.ok(scope.dependencyGraph instanceof DependencyGraph);
    assert.notStrictEqual(scope.dependencyGraph, container.dependencyGraph);
});

check('a container can be told not to hold on to the graph', () => {
    class Alone {}
    const builder = new ContainerBuilder();
    builder.keepDependencyGraph = false;
    builder.register(Alone, Lifetime.Singleton);
    const container = builder.build();

    assert.strictEqual(container.dependencyGraph, null);
    // Reading it is still a question the builder can answer.
    assert.strictEqual(builder.dependencyGraph().find(Alone).name, 'Alone');
});

check('a contract finds the class registered under it', () => {
    const graph = graphOf((builder) => builder.register(Logger, Lifetime.Singleton).as(ILogger));
    assert.strictEqual(graph.find(ILogger), node(graph, 'Logger'));
    assert.strictEqual(graph.find(Logger), node(graph, 'Logger'));
});

check('the text draws each root once and says where a repeat was drawn', () => {
    class Shared {}
    class Left {
        constructor(shared) {
            this.shared = shared;
        }
    }
    class Right {
        constructor(left, shared) {
            this.left = left;
            this.shared = shared;
        }
    }
    injectable(Shared)(Left);
    injectable(Left, Shared)(Right);

    const text = dependencyGraphText(graphOf((builder) => {
        builder.register(Shared, Lifetime.Singleton);
        builder.register(Left, Lifetime.Singleton);
        builder.register(Right, Lifetime.Singleton);
    }));

    assert.match(text, /^Right \[Singleton class]$/m);
    assert.match(text, /├─ constructor parameter 'left' -> Left \[Singleton class]$/m);
    assert.match(text, /│ {2}└─ constructor parameter 'shared' -> Shared \[Singleton class]$/m);
    assert.match(text, /└─ constructor parameter 'shared' -> Shared \[Singleton class]$/m);
    assert.strictEqual(text.split('\n').filter((line) => line.includes('Left [')).length, 1);
});

check('the text marks a loop and what nothing registers', () => {
    const IA = createToken('IGraphTextA');
    const IB = createToken('IGraphTextB');
    class A {
        constructor(b) {
            this.b = b;
        }
    }
    class B {
        constructor(a, missing) {
            this.a = a;
            this.missing = missing;
        }
    }
    injectable(IB)(A);
    injectable(IA, 'IGraphTextGone')(B);

    const text = dependencyGraphText(graphOf((builder) => {
        builder.register(A, Lifetime.Singleton).as(IA);
        builder.register(B, Lifetime.Singleton).as(IB);
    }));

    assert.match(text, /-> A \(cycle\)$/m);
    assert.match(text, /-> IGraphTextGone \(nothing registers it\)$/m);
    assert.match(text, /^Cycle: A -> B \(constructor parameter 'b'\) -> A \(constructor parameter 'a'\)$/m);
});

check('a container with nothing but the resolver still reads', () => {
    assert.strictEqual(dependencyGraphText(new ContainerBuilder().build()), 'IObjectResolver [Transient container]');
    assert.strictEqual(dependencyGraphText(null), 'No registrations.');
});

check('the Mermaid flowchart names every node and dashes what is unmet', () => {
    class Wants {
        constructor(gone) {
            this.gone = gone;
        }
    }
    injectable('IGraphMermaidGone')(Wants);

    const chart = dependencyGraphMermaid(graphOf((builder) => {
        builder.register(Logger, Lifetime.Singleton).as(ILogger);
        builder.register(Wants, Lifetime.Singleton);
    }));

    assert.match(chart, /^flowchart LR$/m);
    assert.match(chart, /n\d+\["Logger<br\/>Singleton class"]/);
    assert.match(chart, /n\d+ -\. "gone" \.-> u0/);
    assert.match(chart, /u0\(\["IGraphMermaidGone"]\):::cosdiUnmet/);
});

check('the diagnostics snapshot carries the graph the panel draws', () => {
    class Save {}
    class Menu {
        constructor(save) {
            this.save = save;
        }
    }
    injectable(Save)(Menu);

    const builder = new ContainerBuilder();
    builder.diagnostics = DiagnosticsContext.getCollector('GraphSnapshotScope');
    builder.register(Save, Lifetime.Singleton);
    builder.register(Menu, Lifetime.Singleton);
    builder.build();

    const snapshot = DiagnosticsContext.toJSON();
    const scope = snapshot.scopes.filter((one) => one.scopeName === 'GraphSnapshotScope')[0];
    assert.ok(scope, 'the scope is in the snapshot');

    const menu = scope.graph.nodes.filter((one) => one.name === 'Menu')[0];
    const save = scope.graph.nodes.filter((one) => one.name === 'Save')[0];
    assert.strictEqual(menu.lifetime, 'Singleton');
    assert.strictEqual(menu.source, 'class');
    assert.deepStrictEqual(menu.edges, [{
        site: "constructor parameter 'save'",
        kind: 'parameter',
        status: 'local',
        token: 'Save',
        targets: [save.id],
    }]);
    assert.deepStrictEqual(save.dependents, [menu.id]);
    assert.ok(scope.graph.roots.indexOf(menu.id) >= 0);
    assert.deepStrictEqual(scope.graph.cycles, []);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(scope.graph)), scope.graph);

    DiagnosticsContext.removeCollector('GraphSnapshotScope');
});

check('a deep graph is walked once, not once per path through it', () => {
    const width = 34;
    const tokens = [];
    const classes = [];
    for (let i = 0; i < width; i++) {
        tokens.push(createToken('IGraphDeep' + i));
    }
    for (let i = 0; i < width; i++) {
        const type = { [`Deep${i}`]: class {} }[`Deep${i}`];
        if (i > 0) {
            injectable(tokens[i - 1], tokens[i - 1])(type);
        }
        classes.push(type);
    }

    const started = Date.now();
    const graph = graphOf((builder) => {
        for (let i = 0; i < width; i++) {
            builder.register(classes[i], Lifetime.Singleton).as(tokens[i]);
        }
    });
    const elapsed = Date.now() - started;

    assert.strictEqual(graph.cycles.length, 0);
    assert.ok(elapsed < 500, `building the graph took ${elapsed}ms`);
});

check('the diagnostics panel draws the graph a snapshot carries', () => {
    const panel = loadPanel();
    const html = panel.renderGraph({
        nodes: [
            {
                id: 0,
                name: 'Menu',
                lifetime: 'Singleton',
                source: 'class',
                scope: 'local',
                contracts: ['IMenu'],
                dependents: [],
                edges: [
                    { site: "constructor parameter 'save'", kind: 'parameter', status: 'local', token: 'Save', targets: [1] },
                    { site: "field 'audio'", kind: 'field', status: 'missing', token: 'IAudio', targets: [] },
                ],
            },
            {
                id: 1,
                name: 'Save',
                lifetime: 'Singleton',
                source: 'class',
                scope: 'parent',
                contracts: [],
                dependents: [0],
                edges: [],
            },
        ],
        roots: [0],
        cycles: ['Menu -> Save -> Menu'],
    });

    assert.match(html, /<summary>Dependency graph<\/summary>/);
    assert.match(html, /Menu <span class="dim">\[Singleton class, as IMenu]<\/span>/);
    assert.match(html, /└─ field 'audio' -&gt; <span class="unmet">IAudio \(nothing registers it\)<\/span>/);
    assert.match(html, /Save <span class="dim">\[Singleton class, from a parent scope]<\/span>/);
    assert.match(html, /<span class="cycle">Cycle: Menu -&gt; Save -&gt; Menu<\/span>/);
    assert.strictEqual(panel.renderGraph(undefined), '');
});

/** Loads the editor panel outside the editor, with its helpers reachable. */
function loadPanel() {
    const fs = require('fs');
    const Module = require('module');
    const file = path.join(__dirname, '..', 'extensions', 'cosdi-diagnostics', 'panels', 'default.js');
    const source = fs.readFileSync(file, 'utf8') + '\nmodule.exports.renderGraph = renderGraph;\n';

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
    console.error(failures + ' dependency graph test(s) failed');
    process.exit(1);
}
console.log('dependency graph tests passed');
