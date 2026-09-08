import {
    ContainerBuilder, CosDISettings, DiagnosticsContext, IContainerBuilder, IObjectResolver, Lifetime,
} from 'db://assets/CosDI/Runtime/index';
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

/** Same inner-loop count as VContainer.Benchmark (`const int N = 10_000`). */
export const N = 10_000;
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
            name: 'ResolveScoped',
            sampleGroup: 'CosDI',
            resolvesPerIteration: 3,
            setup: () => {
                const container = buildScoped();
                const scope = container.createScope();
                return () => {
                    for (let i = 0; i < N; i++) {
                        scope.resolve(ISingleton1);
                        scope.resolve(ISingleton2);
                        scope.resolve(ISingleton3);
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
    const method = testCase.setup();
    for (let i = 0; i < WARMUP; i++) {
        method();
    }

    const times: number[] = [];
    const heapBefore = readHeap();
    for (let i = 0; i < SAMPLES; i++) {
        const started = nowMs();
        method();
        times.push(nowMs() - started);
    }
    const heapAfter = readHeap();
    times.sort((a, b) => a - b);

    const sum = times.reduce((acc, value) => acc + value, 0);
    const medianMs = percentile(times, 0.5);
    const totalResolves = N * testCase.resolvesPerIteration;
    return {
        name: testCase.name,
        sampleGroup: testCase.sampleGroup,
        n: N,
        samples: SAMPLES,
        medianMs,
        meanMs: sum / times.length,
        minMs: times[0],
        maxMs: times[times.length - 1],
        nsPerResolve: (medianMs * 1_000_000) / totalResolves,
        heapDeltaKb: heapBefore != null && heapAfter != null ? (heapAfter - heapBefore) / 1024 : null,
    };
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

function buildScoped(): IObjectResolver {
    const builder = new ContainerBuilder();
    builder.register(Singleton1, Lifetime.Scoped).as(ISingleton1);
    builder.register(Singleton2, Lifetime.Scoped).as(ISingleton2);
    builder.register(Singleton3, Lifetime.Scoped).as(ISingleton3);
    return builder.build();
}
