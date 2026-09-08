import { _decorator, Component } from 'cc';
import {
    assertGraphResolves,
    BenchmarkResult,
    getBenchmarkCases,
    measure,
} from './ContainerPerformanceTest';
import { CosDISettings, DiagnosticsBridge, DiagnosticsContext } from 'cosdi';

const { ccclass, property, executionOrder } = _decorator;

const PANEL_ID = 'cosdi-benchmark-overlay';

@ccclass('CosDIBenchmarkRunner')
@executionOrder(1000)
export class CosDIBenchmarkRunner extends Component {
    @property
    runOnStart = true;

    private running = false;

    start() {
        if (this.runOnStart) {
            this.run();
        }
    }

    async run() {
        if (this.running) {
            return;
        }
        this.running = true;
        const previousDiagnostics = CosDISettings.enableDiagnostics;
        CosDISettings.enableDiagnostics = false;
        const results: BenchmarkResult[] = [];
        try {
            publishBenchmark('running', 'Checking VContainer + deep/wide/gameplay graphs...', []);
            showOverlay('CosDI stress benchmark starting...\nChecking VContainer + deep/wide/gameplay graphs...');
            assertGraphResolves();
            const cases = getBenchmarkCases();
            for (let i = 0; i < cases.length; i++) {
                const testCase = cases[i];
                const progress = `Running ${i + 1}/${cases.length}: ${testCase.name} (${testCase.sampleGroup})...`;
                publishBenchmark('running', progress, results);
                showOverlay(formatTable(results) + `\n${progress}`);
                await nextFrame();
                results.push(measure(testCase));
            }
            const table = formatTable(results);
            const ratios = formatRatios(results);
            publishBenchmark('done', ratios, results);
            console.log(table);
            console.log(ratios);
            console.table(results.map((result) => ({
                Case: result.name,
                Group: result.sampleGroup,
                'Median ms': result.medianMs.toFixed(2),
                'Mean ms': result.meanMs.toFixed(2),
                'Min ms': result.minMs.toFixed(2),
                'Max ms': result.maxMs.toFixed(2),
                'ns/op': Math.round(result.nsPerResolve),
                'Heap KB': result.heapDeltaKb == null ? '-' : Math.round(result.heapDeltaKb),
            })));
            showOverlay(table + '\n\n' + ratios);
            return results;
        } catch (error) {
            const message = '[CosDI] Benchmark failed: ' + (error instanceof Error ? error.message : String(error));
            publishBenchmark('failed', message, results);
            console.error(message, error);
            showOverlay(message);
            throw error;
        } finally {
            CosDISettings.enableDiagnostics = previousDiagnostics;
            this.running = false;
        }
    }
}

function formatTable(results: BenchmarkResult[]): string {
    const lines = [
        'CosDI stress benchmark (VContainer cases + deep/wide/gameplay graphs, 10 samples, 3 warmup)',
        pad('Case', 26) + pad('Group', 22) + pad('N', 8) + pad('Median', 12) + pad('Mean', 12) + pad('Min', 12) + pad('Max', 12) + pad('ns/op', 10) + pad('Heap', 10),
        '-'.repeat(124),
    ];
    for (const result of results) {
        lines.push(
            pad(result.name, 26)
            + pad(result.sampleGroup, 22)
            + pad(String(result.n), 8)
            + pad(result.medianMs.toFixed(2) + ' ms', 12)
            + pad(result.meanMs.toFixed(2) + ' ms', 12)
            + pad(result.minMs.toFixed(2) + ' ms', 12)
            + pad(result.maxMs.toFixed(2) + ' ms', 12)
            + pad(String(Math.round(result.nsPerResolve)), 10)
            + pad(result.heapDeltaKb == null ? '-' : result.heapDeltaKb.toFixed(0) + ' KB', 10),
        );
    }
    if (results.length) {
        lines.push('');
        lines.push('ns/op is nanoseconds per top-level resolve (or per build / scope open).');
        lines.push('Direct new is the theoretical floor. Heap ignores GC drops (negative samples).');
    }
    return lines.join('\n');
}

function formatRatios(results: BenchmarkResult[]): string {
    const lines = ['CosDI vs Direct new:'];
    const names = ['ResolveCombined', 'ResolveComplex', 'ResolveDeep12', 'ResolveWide16', 'SpawnEnemy'];
    for (const name of names) {
        const cosdi = results.find((result) => result.name === name && result.sampleGroup === 'CosDI');
        const direct = results.find((result) => result.name === name && result.sampleGroup === 'Direct new');
        if (!cosdi || !direct || direct.nsPerResolve <= 0) {
            continue;
        }
        const ratio = cosdi.nsPerResolve / direct.nsPerResolve;
        lines.push(`  ${name}: ${ratio.toFixed(1)}x  (${Math.round(cosdi.nsPerResolve)} ns vs ${Math.round(direct.nsPerResolve)} ns)`);
    }
    lines.push('Rule of thumb: singleton/nested lookup should stay cheap. SpawnEnemy under ~2 µs is fine for hundreds of spawns per frame.');
    return lines.join('\n');
}

function pad(value: string, width: number): string {
    if (value.length >= width) {
        return value.slice(0, width - 1) + ' ';
    }
    return value + ' '.repeat(width - value.length);
}

function publishBenchmark(
    status: 'running' | 'done' | 'failed',
    detail: string,
    results: BenchmarkResult[],
): void {
    DiagnosticsContext.setBenchmark({
        status,
        title: 'CosDI stress benchmark',
        detail,
        results: results.map((result) => ({
            name: result.name,
            sampleGroup: result.sampleGroup,
            n: result.n,
            medianMs: result.medianMs,
            meanMs: result.meanMs,
            minMs: result.minMs,
            maxMs: result.maxMs,
            nsPerResolve: result.nsPerResolve,
            heapDeltaKb: result.heapDeltaKb,
        })),
    });
    DiagnosticsBridge.flush();
}

function showOverlay(text: string): void {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc || !doc.body) {
        return;
    }
    let panel = doc.getElementById(PANEL_ID);
    if (!panel) {
        panel = doc.createElement('pre');
        panel.id = PANEL_ID;
        panel.setAttribute('style', [
            'position:fixed',
            'left:12px',
            'top:12px',
            'z-index:99999',
            'max-width:min(96vw, 980px)',
            'max-height:90vh',
            'overflow:auto',
            'margin:0',
            'padding:12px 14px',
            'background:rgba(8,10,14,.92)',
            'color:#d7e0ea',
            'font:12px/1.45 Consolas, monospace',
            'border:1px solid #445',
            'border-radius:8px',
            'white-space:pre',
        ].join(';'));
        doc.body.appendChild(panel);
    }
    panel.textContent = text;
}

function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => resolve());
            return;
        }
        setTimeout(resolve, 0);
    });
}
