import {
    ContainerBuilder, CosDISettings, DiagnosticsContext, IContainerBuilder, IObjectResolver, IScopedObjectResolver, Lifetime,
} from 'cosdi';
import {
    Combined1, Combined2, Combined3,
    Complex1, Complex2, Complex3,
    FirstService, ICombined1, ICombined2, ICombined3,
    IComplex1, IComplex2, IComplex3,
    IFirstService, ISecondService, ISubObjectA, ISubObjectB, ISubObjectC,
    ISubObjectOne, ISubObjectThree, ISubObjectTwo, ISingleton1, ISingleton2, ISingleton3,
    IThirdService, ITransient1, ITransient2, ITransient3,
    SecondService, Singleton1, Singleton2, Singleton3,
    SubObjectA, SubObjectB, SubObjectC, SubObjectOne, SubObjectThree, SubObjectTwo,
    ThirdService, Transient1, Transient2, Transient3,
} from './Fixtures';
import {
    AI, Blackboard, Clock, createDeepDirect, createEnemyDirect, createWideDirect, Damage,
    deepTokens, deepTypes, Enemy, FieldHeavy, fillerTokens, fillerTypes, IAI, IBlackboard, IClock, IDamage,
    IDeepRoot, IEnemy, ILogger, IPathfinding, IPlugin, IPopupVm, IRng, ISceneState, IStats,
    IWeapon, IWideSystem, Logger, Pathfinding, PLUGIN_COUNT, pluginTypes, PopupVm, Rng,
    SceneState, Stats, Weapon, wideTokens, wideTypes, WideSystem,
} from './HeavyFixtures';

/** Same inner-loop count as VContainer.Benchmark (`const int N = 10_000`). */
export const N = 10_000;
export const N_SCOPE = 1_000;
export const N_BUILD_LARGE = 1_000;
const WARMUP = 3;
const SAMPLES = 10;

export interface BenchmarkResult {
    name: string;
    sampleGroup: string;
    n: number;
    samples: number;
    medianMs: number;
    meanMs: number;
    minMs: number;
    maxMs: number;
    nsPerResolve: number;
    heapDeltaKb: number | null;
}

export interface BenchmarkCase {
    name: string;
    sampleGroup: string;
    resolvesPerIteration: number;
    n?: number;
    setup: () => () => void;
}

export function getBenchmarkCases(): BenchmarkCase[] {
    return [
        {
            name: 'ResolveSingleton',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 3,
            setup: () => {
                const container = buildSingleton();
                return () => {
                    for (let i = 0; i < N; i++) {
                        container.resolve(ISingleton1);
                        container.resolve(ISingleton2);
                        container.resolve(ISingleton3);
                    }
                };
            },
        },
        {
            name: 'ResolveTransient',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 3,
            setup: () => {
                const container = buildTransient();
                return () => {
                    for (let i = 0; i < N; i++) {
                        container.resolve(ITransient1);
                        container.resolve(ITransient2);
                        container.resolve(ITransient3);
                    }
                };
            },
        },
        {
            name: 'ResolveCombined',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 3,
            setup: () => {
                const container = buildCombined();
                return () => {
                    for (let i = 0; i < N; i++) {
                        container.resolve(ICombined1);
                        container.resolve(ICombined2);
                        container.resolve(ICombined3);
                    }
                };
            },
        },
        {
            name: 'ResolveComplex',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 3,
            setup: () => {
                const container = buildComplex();
                return () => {
                    for (let i = 0; i < N; i++) {
                        container.resolve(IComplex1);
                        container.resolve(IComplex2);
                        container.resolve(IComplex3);
                    }
                };
            },
        },
        {
            name: 'ResolveDeep12',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 1,
            setup: () => {
                const container = buildDeep();
                return () => {
                    for (let i = 0; i < N; i++) {
                        container.resolve(IDeepRoot);
                    }
                };
            },
        },
        {
            name: 'ResolveWide16',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 1,
            setup: () => {
                const container = buildWide();
                return () => {
                    for (let i = 0; i < N; i++) {
                        container.resolve(IWideSystem);
                    }
                };
            },
        },
        {
            name: 'ResolveLarge200',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 3,
            setup: () => {
                const container = buildLarge();
                return () => {
                    for (let i = 0; i < N; i++) {
                        container.resolve(ISingleton1);
                        container.resolve(ISingleton2);
                        container.resolve(ISingleton3);
                    }
                };
            },
        },
        {
            name: 'SpawnEnemy',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 1,
            setup: () => {
                const container = buildGameplay();
                return () => {
                    for (let i = 0; i < N; i++) {
                        container.resolve(IEnemy);
                    }
                };
            },
        },
        {
            name: 'ResolveNested4',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 2,
            setup: () => {
                const deepest = buildNestedScopes();
                return () => {
                    for (let i = 0; i < N; i++) {
                        deepest.resolve(ILogger);
                        deepest.resolve(ISceneState);
                    }
                };
            },
        },
        {
            name: 'ResolveCollection20',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 1,
            setup: () => {
                const container = buildCollection();
                return () => {
                    for (let i = 0; i < N; i++) {
                        container.resolveAll(IPlugin);
                    }
                };
            },
        },
        {
            name: 'InjectFields12',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 1,
            setup: () => {
                const container = buildWide();
                const targets: FieldHeavy[] = [];
                for (let i = 0; i < N; i++) {
                    targets.push(new FieldHeavy());
                }
                return () => {
                    for (let i = 0; i < N; i++) {
                        container.inject(targets[i]);
                    }
                };
            },
        },
        {
            name: 'CreateDisposeScope',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 1,
            n: N_SCOPE,
            setup: () => {
                const scene = buildGameplay().createScope((builder) => {
                    builder.register(SceneState, Lifetime.Scoped).as(ISceneState);
                });
                return () => {
                    for (let i = 0; i < N_SCOPE; i++) {
                        const popup = scene.createScope((builder) => {
                            builder.register(PopupVm, Lifetime.Transient).as(IPopupVm);
                        });
                        popup.resolve(IPopupVm);
                        popup.dispose();
                    }
                };
            },
        },
        {
            name: 'ContainerBuildComplex',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 1,
            setup: () => {
                return () => {
                    for (let i = 0; i < N; i++) {
                        buildComplex();
                    }
                };
            },
        },
        {
            name: 'ContainerBuildLarge200',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 1,
            n: N_BUILD_LARGE,
            setup: () => {
                return () => {
                    for (let i = 0; i < N_BUILD_LARGE; i++) {
                        buildLarge();
                    }
                };
            },
        },
        {
            name: 'ResolveCombined',
            sampleGroup: 'Direct new',
            resolvesPerIteration: 3,
            setup: () => {
                const s1 = new Singleton1();
                const s2 = new Singleton2();
                const s3 = new Singleton3();
                return () => {
                    for (let i = 0; i < N; i++) {
                        new Combined1(s1, new Transient1());
                        new Combined2(s2, new Transient2());
                        new Combined3(s3, new Transient3());
                    }
                };
            },
        },
        {
            name: 'ResolveComplex',
            sampleGroup: 'Direct new',
            resolvesPerIteration: 3,
            setup: () => {
                const first = new FirstService();
                const second = new SecondService();
                const third = new ThirdService();
                return () => {
                    for (let i = 0; i < N; i++) {
                        new Complex1(first, second, third, new SubObjectOne(first), new SubObjectTwo(second), new SubObjectThree(third));
                        new Complex2(first, second, third, new SubObjectOne(first), new SubObjectTwo(second), new SubObjectThree(third));
                        new Complex3(first, second, third, new SubObjectOne(first), new SubObjectTwo(second), new SubObjectThree(third));
                    }
                };
            },
        },
        {
            name: 'ResolveDeep12',
            sampleGroup: 'Direct new',
            resolvesPerIteration: 1,
            setup: () => {
                return () => {
                    for (let i = 0; i < N; i++) {
                        createDeepDirect();
                    }
                };
            },
        },
        {
            name: 'ResolveWide16',
            sampleGroup: 'Direct new',
            resolvesPerIteration: 1,
            setup: () => {
                return () => {
                    for (let i = 0; i < N; i++) {
                        createWideDirect();
                    }
                };
            },
        },
        {
            name: 'SpawnEnemy',
            sampleGroup: 'Direct new',
            resolvesPerIteration: 1,
            setup: () => {
                return () => {
                    for (let i = 0; i < N; i++) {
                        createEnemyDirect();
                    }
                };
            },
        },
        {
            name: 'ResolveComplex',
            sampleGroup: 'CosDI + diagnostics',
            resolvesPerIteration: 3,
            setup: () => {
                const container = buildComplex(true);
                return () => {
                    for (let i = 0; i < N; i++) {
                        container.resolve(IComplex1);
                        container.resolve(IComplex2);
                        container.resolve(IComplex3);
                    }
                };
            },
        },
    ];
}

export function runContainerPerformanceTests(): BenchmarkResult[] {
    const previousDiagnostics = CosDISettings.enableDiagnostics;
    CosDISettings.enableDiagnostics = false;
    try {
        assertGraphResolves();
        return getBenchmarkCases().map((testCase) => measure(testCase));
    } finally {
        CosDISettings.enableDiagnostics = previousDiagnostics;
    }
}

export function measure(testCase: BenchmarkCase): BenchmarkResult {
    DiagnosticsContext.pausePublishing();
    try {
        const iterations = testCase.n ?? N;
        const method = testCase.setup();
        for (let i = 0; i < WARMUP; i++) {
            method();
        }

        const times: number[] = [];
        const heapDeltas: number[] = [];
        for (let i = 0; i < SAMPLES; i++) {
            const heapBefore = readHeap();
            const started = nowMs();
            method();
            times.push(nowMs() - started);
            const heapAfter = readHeap();
            if (heapBefore != null && heapAfter != null && heapAfter >= heapBefore) {
                heapDeltas.push((heapAfter - heapBefore) / 1024);
            }
        }
        times.sort((a, b) => a - b);
        heapDeltas.sort((a, b) => a - b);

        const sum = times.reduce((acc, value) => acc + value, 0);
        const medianMs = percentile(times, 0.5);
        const totalResolves = iterations * testCase.resolvesPerIteration;
        return {
            name: testCase.name,
            sampleGroup: testCase.sampleGroup,
            n: iterations,
            samples: SAMPLES,
            medianMs,
            meanMs: sum / times.length,
            minMs: times[0],
            maxMs: times[times.length - 1],
            nsPerResolve: (medianMs * 1e6) / Math.max(totalResolves, 1),
            heapDeltaKb: heapDeltas.length ? percentile(heapDeltas, 0.5) : null,
        };
    } finally {
        DiagnosticsContext.removeCollector('CosDIBenchmark');
        DiagnosticsContext.resumePublishing();
    }
}

function percentile(sorted: number[], p: number): number {
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) {
        return sorted[lower];
    }
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function nowMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}

function readHeap(): number | null {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? memory.usedJSHeapSize : null;
}

export function assertGraphResolves(): void {
    const combined = buildCombined();
    if (!combined.resolve(ICombined1) || !combined.resolve(ICombined2) || !combined.resolve(ICombined3)) {
        throw new Error('Combined graph failed to resolve');
    }
    const first = combined.resolve(ISingleton1);
    if (combined.resolve(ISingleton1) !== first) {
        throw new Error('Singleton lifetime is not sharing one instance');
    }
    const transient = combined.resolve(ITransient1);
    if (combined.resolve(ITransient1) === transient) {
        throw new Error('Transient lifetime is not creating a new instance');
    }
    const complex = buildComplex();
    if (!complex.resolve(IComplex1) || !complex.resolve(IComplex2) || !complex.resolve(IComplex3)) {
        throw new Error('Complex graph failed to resolve');
    }
    if (!buildDeep().resolve(IDeepRoot)) {
        throw new Error('Deep12 graph failed to resolve');
    }
    if (!buildWide().resolve(IWideSystem)) {
        throw new Error('Wide16 graph failed to resolve');
    }
    if (!buildGameplay().resolve(IEnemy)) {
        throw new Error('Enemy spawn graph failed to resolve');
    }
    const plugins = buildCollection().resolveAll(IPlugin);
    if (plugins.length < PLUGIN_COUNT) {
        throw new Error('Collection20 failed to resolve all plugins');
    }
    const fieldTarget = new FieldHeavy();
    buildWide().inject(fieldTarget);
    if (!(fieldTarget as { s0?: object }).s0) {
        throw new Error('Field injection failed');
    }
}

function registerSingleton(builder: IContainerBuilder): void {
    builder.register(Singleton1, Lifetime.Singleton).as(ISingleton1);
    builder.register(Singleton2, Lifetime.Singleton).as(ISingleton2);
    builder.register(Singleton3, Lifetime.Singleton).as(ISingleton3);
}

function registerTransient(builder: IContainerBuilder): void {
    builder.register(Transient1, Lifetime.Transient).as(ITransient1);
    builder.register(Transient2, Lifetime.Transient).as(ITransient2);
    builder.register(Transient3, Lifetime.Transient).as(ITransient3);
}

function buildSingleton(): IObjectResolver {
    const builder = new ContainerBuilder();
    registerSingleton(builder);
    return builder.build();
}

function buildTransient(): IObjectResolver {
    const builder = new ContainerBuilder();
    registerTransient(builder);
    return builder.build();
}

function buildCombined(): IObjectResolver {
    const builder = new ContainerBuilder();
    registerSingleton(builder);
    registerTransient(builder);
    builder.register(Combined1, Lifetime.Transient).as(ICombined1);
    builder.register(Combined2, Lifetime.Transient).as(ICombined2);
    builder.register(Combined3, Lifetime.Transient).as(ICombined3);
    return builder.build();
}

function buildComplex(withDiagnostics = false): IObjectResolver {
    const builder = new ContainerBuilder();
    if (withDiagnostics) {
        builder.diagnostics = DiagnosticsContext.getCollector('CosDIBenchmark');
    }
    builder.register(FirstService, Lifetime.Singleton).as(IFirstService);
    builder.register(SecondService, Lifetime.Singleton).as(ISecondService);
    builder.register(ThirdService, Lifetime.Singleton).as(IThirdService);
    builder.register(SubObjectA, Lifetime.Transient).as(ISubObjectA);
    builder.register(SubObjectB, Lifetime.Transient).as(ISubObjectB);
    builder.register(SubObjectC, Lifetime.Transient).as(ISubObjectC);
    builder.register(Complex1, Lifetime.Transient).as(IComplex1);
    builder.register(Complex2, Lifetime.Transient).as(IComplex2);
    builder.register(Complex3, Lifetime.Transient).as(IComplex3);
    builder.register(SubObjectOne, Lifetime.Transient).as(ISubObjectOne);
    builder.register(SubObjectTwo, Lifetime.Transient).as(ISubObjectTwo);
    builder.register(SubObjectThree, Lifetime.Transient).as(ISubObjectThree);
    return builder.build();
}

function buildDeep(): IObjectResolver {
    const builder = new ContainerBuilder();
    for (let i = 0; i < deepTypes.length; i++) {
        const lifetime = i === 0 ? Lifetime.Singleton : Lifetime.Transient;
        builder.register(deepTypes[i], lifetime).as(deepTokens[i]);
    }
    return builder.build();
}

function buildWide(): IObjectResolver {
    const builder = new ContainerBuilder();
    for (let i = 0; i < wideTypes.length; i++) {
        builder.register(wideTypes[i], Lifetime.Singleton).as(wideTokens[i]);
    }
    builder.register(WideSystem, Lifetime.Transient).as(IWideSystem);
    return builder.build();
}

function buildLarge(): IObjectResolver {
    const builder = new ContainerBuilder();
    registerSingleton(builder);
    for (let i = 0; i < fillerTypes.length; i++) {
        builder.register(fillerTypes[i], Lifetime.Singleton).as(fillerTokens[i]);
    }
    return builder.build();
}

function buildGameplay(): IObjectResolver {
    const builder = new ContainerBuilder();
    builder.register(Logger, Lifetime.Singleton).as(ILogger);
    builder.register(Clock, Lifetime.Singleton).as(IClock);
    builder.register(Rng, Lifetime.Singleton).as(IRng);
    builder.register(Pathfinding, Lifetime.Singleton).as(IPathfinding);
    builder.register(Damage, Lifetime.Singleton).as(IDamage);
    builder.register(Blackboard, Lifetime.Transient).as(IBlackboard);
    builder.register(AI, Lifetime.Transient).as(IAI);
    builder.register(Weapon, Lifetime.Transient).as(IWeapon);
    builder.register(Stats, Lifetime.Transient).as(IStats);
    builder.register(Enemy, Lifetime.Transient).as(IEnemy);
    return builder.build();
}

function buildNestedScopes(): IScopedObjectResolver {
    const builder = new ContainerBuilder();
    builder.register(Logger, Lifetime.Singleton).as(ILogger);
    builder.register(Clock, Lifetime.Singleton).as(IClock);
    builder.register(SceneState, Lifetime.Scoped).as(ISceneState);
    const root = builder.build();
    const scene = root.createScope();
    const hud = scene.createScope();
    return hud.createScope();
}

function buildCollection(): IObjectResolver {
    const builder = new ContainerBuilder();
    for (let i = 0; i < pluginTypes.length; i++) {
        builder.register(pluginTypes[i], Lifetime.Singleton).as(IPlugin);
    }
    return builder.build();
}
