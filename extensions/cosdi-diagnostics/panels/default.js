'use strict';

const DIAGNOSTICS_URL = 'http://127.0.0.1:38477/diagnostics';

module.exports = Editor.Panel.define({
    listeners: {
        show() {},
        hide() {},
    },
    template: `
<section class="cosdi-diagnostics">
  <header>
    <h2>CosDI Diagnostics</h2>
    <ui-button class="refresh">Refresh</ui-button>
  </header>
  <p class="hint">Play the scene in Game View. Scopes and CosDIBenchmarkRunner results appear while play is running.</p>
  <div class="content"></div>
</section>
`,
    style: `
.cosdi-diagnostics {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
  color: var(--color-normal-contrast, #ccc);
  font-family: 'Segoe UI', Consolas, monospace;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
h2 {
  margin: 0;
  font-size: 16px;
}
.hint {
  margin: 0 0 12px;
  opacity: 0.75;
  font-size: 12px;
}
.content {
  flex: 1;
  overflow: auto;
}
.scope {
  border: 1px solid var(--color-default-border, #444);
  border-radius: 6px;
  margin-bottom: 10px;
  padding: 8px 10px;
}
.scope h3 {
  margin: 0 0 8px;
  font-size: 13px;
}
.scope .parent {
  font-weight: normal;
  opacity: 0.7;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th, td {
  text-align: left;
  padding: 4px 6px;
  border-bottom: 1px solid var(--color-default-border, #333);
}
.empty {
  opacity: 0.7;
  font-size: 12px;
}
.bench-detail {
  margin: 0 0 8px;
  font: 12px/1.45 Consolas, monospace;
  white-space: pre-wrap;
  opacity: 0.9;
}
.graph {
  margin-top: 8px;
}
.graph summary {
  cursor: pointer;
  font-size: 12px;
  opacity: 0.85;
}
.graph pre {
  margin: 6px 0 0;
  font: 12px/1.5 Consolas, monospace;
  white-space: pre;
  overflow-x: auto;
}
.graph .dim {
  opacity: 0.65;
}
.graph .unmet {
  color: var(--color-danger-fill, #d9534f);
}
.graph .cycle {
  color: var(--color-warn-fill, #d0a020);
}
`,
    $: {
        refresh: '.refresh',
        content: '.content',
    },
    methods: {},
    ready() {
        let lastHtml = '';
        const refresh = async () => {
            const content = this.$.content;
            if (!content) {
                return;
            }
            try {
                const data = await readSnapshot();
                if (!hasPayload(data)) {
                    const html = '<p class="empty">' + escapeHtml(data.message || waitingMessage()) + '</p>';
                    if (html !== lastHtml) {
                        lastHtml = html;
                        content.innerHTML = html;
                    }
                    return;
                }
                const html = renderBenchmark(data.benchmark) + renderScopes(data.scopes || []);
                if (html !== lastHtml) {
                    lastHtml = html;
                    content.innerHTML = html;
                }
            } catch (error) {
                console.warn('[CosDI] Diagnostics panel refresh failed', error);
            }
        };

        if (this.$.refresh) {
            this.$.refresh.addEventListener('confirm', () => refresh());
            this.$.refresh.addEventListener('click', () => refresh());
        }
        this._timer = setInterval(() => refresh(), 400);
        refresh();
    },
    beforeClose() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    },
    close() {},
});

async function readSnapshot() {
    const sources = [fromExtension, fromHttp, fromScene];
    for (const source of sources) {
        try {
            const data = await source();
            if (hasPayload(data)) {
                return data;
            }
        } catch (_error) {}
    }
    return { scopes: [], message: waitingMessage() };
}

async function fromExtension() {
    return Editor.Message.request('cosdi-diagnostics', 'get-snapshot');
}

async function fromHttp() {
    const response = await fetch(DIAGNOSTICS_URL);
    if (!response.ok) {
        return null;
    }
    return response.json();
}

async function fromScene() {
    return Editor.Message.request('scene', 'execute-scene-script', {
        name: 'cosdi-diagnostics',
        method: 'getDiagnostics',
        args: [],
    });
}

function waitingMessage() {
    return 'Waiting for play. Keep this panel open, enable the CosDI Diagnostics extension, then press Play on a scene that has a LifetimeScope or CosDIBenchmarkRunner.';
}

function hasPayload(data) {
    return !!(data && ((data.scopes && data.scopes.length) || data.benchmark));
}

function renderBenchmark(benchmark) {
    if (!benchmark) {
        return '';
    }
    const status = benchmark.status === 'done'
        ? 'Done'
        : benchmark.status === 'failed'
            ? 'Failed'
            : 'Running';
    const rows = (benchmark.results || []).map((result) => {
        const heap = result.heapDeltaKb == null ? '-' : Math.round(result.heapDeltaKb) + ' KB';
        return '<tr>'
            + '<td>' + escapeHtml(result.name) + '</td>'
            + '<td>' + escapeHtml(result.sampleGroup) + '</td>'
            + '<td>' + Number(result.medianMs || 0).toFixed(2) + ' ms</td>'
            + '<td>' + Number(result.meanMs || 0).toFixed(2) + ' ms</td>'
            + '<td>' + Math.round(result.nsPerResolve || 0) + '</td>'
            + '<td>' + escapeHtml(String(heap)) + '</td>'
            + '</tr>';
    }).join('');
    return '<article class="scope">'
        + '<h3>' + escapeHtml(benchmark.title || 'Benchmark') + '<span class="parent"> (' + escapeHtml(status) + ')</span></h3>'
        + (benchmark.detail ? '<pre class="bench-detail">' + escapeHtml(benchmark.detail) + '</pre>' : '')
        + (rows
            ? '<table><thead><tr><th>Case</th><th>Group</th><th>Median</th><th>Mean</th><th>ns/op</th><th>Heap</th></tr></thead><tbody>'
                + rows
                + '</tbody></table>'
            : '')
        + '</article>';
}

function renderScopes(scopes) {
    const byParent = new Map();
    scopes.forEach((scope) => {
        const key = scope.parentScopeName || '';
        if (!byParent.has(key)) {
            byParent.set(key, []);
        }
        byParent.get(key).push(scope);
    });

    const roots = byParent.get('') || scopes.filter((scope) => {
        return !scope.parentScopeName || !scopes.some((other) => other.scopeName === scope.parentScopeName);
    });

    const visited = new Set();
    const renderScope = (scope, depth) => {
        if (visited.has(scope.scopeName)) {
            return '';
        }
        visited.add(scope.scopeName);
        const children = byParent.get(scope.scopeName) || [];
        const parentLabel = scope.parentScopeName ? ' ← ' + scope.parentScopeName : ' (root)';
        const rows = (scope.registrations || []).slice(0, 64).map((reg) => {
            const deps = (reg.dependencies || []).slice(0, 12).join(', ');
            return '<tr>'
                + '<td>' + escapeHtml(reg.type) + '</td>'
                + '<td>' + escapeHtml(reg.lifetime) + '</td>'
                + '<td>' + reg.refCount + '</td>'
                + '<td>' + Number(reg.resolveTime || 0).toFixed(2) + ' ms</td>'
                + '<td>' + escapeHtml(deps) + '</td>'
                + '</tr>';
        }).join('');
        return '<article class="scope" style="margin-left:' + (depth * 16) + 'px">'
            + '<h3>' + escapeHtml(scope.scopeName) + '<span class="parent">' + escapeHtml(parentLabel) + '</span></h3>'
            + '<table><thead><tr>'
            + '<th>Type</th><th>Lifetime</th><th>Resolves</th><th>Time</th><th>Dependencies</th>'
            + '</tr></thead><tbody>'
            + (rows || '<tr><td colspan="5">No registrations yet</td></tr>')
            + '</tbody></table>'
            + renderGraph(scope.graph)
            + '</article>'
            + children.map((child) => renderScope(child, depth + 1)).join('');
    };

    const rendered = roots.map((scope) => renderScope(scope, 0)).join('');
    const leftover = scopes.filter((scope) => !visited.has(scope.scopeName))
        .map((scope) => renderScope(scope, 0))
        .join('');
    return rendered + leftover;
}

/**
 * Draws what the container was built with: every registration, what it asks
 * for, and what answered. This is read off the registrations at build time, so
 * it is there before anything is resolved.
 */
function renderGraph(graph) {
    if (!graph || !graph.nodes || !graph.nodes.length) {
        return '';
    }

    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const drawn = new Set();
    const lines = [];

    const label = (node) => {
        const parts = [node.lifetime + ' ' + node.source];
        if (node.contracts && node.contracts.length) {
            parts.push('as ' + node.contracts.join(', '));
        }
        if (node.scope === 'parent') {
            parts.push('from a parent scope');
        }
        return escapeHtml(node.name) + ' <span class="dim">[' + escapeHtml(parts.join(', ')) + ']</span>';
    };

    const draw = (node, indent, site, path, depth) => {
        if (!node || lines.length > 400) {
            return;
        }
        const from = site ? escapeHtml(site) + ' -&gt; ' : '';
        if (path.indexOf(node.id) >= 0) {
            lines.push(indent + from + '<span class="cycle">' + escapeHtml(node.name) + ' (cycle)</span>');
            return;
        }
        const again = drawn.has(node.id) && node.edges.length > 0;
        lines.push(indent + from + label(node) + (again ? ' <span class="dim">(drawn above)</span>' : ''));
        drawn.add(node.id);
        if (again || depth > 24) {
            return;
        }

        const children = [];
        node.edges.forEach((edge) => {
            if (!edge.targets.length) {
                children.push({ edge: edge, target: null });
                return;
            }
            edge.targets.forEach((id) => children.push({ edge: edge, target: byId.get(id) }));
        });

        const below = indent === '' ? '' : indent.slice(0, -3) + (indent.slice(-3) === '└─ ' ? '   ' : '│  ');
        children.forEach((child, index) => {
            const childIndent = below + (index === children.length - 1 ? '└─ ' : '├─ ');
            if (!child.target) {
                const unmet = child.edge.status === 'keyless'
                    ? 'nothing named'
                    : child.edge.token + ' (nothing registers it)';
                lines.push(childIndent + escapeHtml(child.edge.site) + ' -&gt; <span class="unmet">' + escapeHtml(unmet) + '</span>');
                return;
            }
            draw(child.target, childIndent, child.edge.site, path.concat([node.id]), depth + 1);
        });
    };

    const roots = graph.roots && graph.roots.length ? graph.roots : graph.nodes.map((node) => node.id);
    roots.forEach((id) => draw(byId.get(id), '', '', [], 0));
    graph.nodes.forEach((node) => {
        if (!drawn.has(node.id)) {
            draw(node, '', '', [], 0);
        }
    });
    (graph.cycles || []).forEach((cycle) => {
        lines.push('<span class="cycle">Cycle: ' + escapeHtml(cycle) + '</span>');
    });

    return '<details class="graph" open><summary>Dependency graph</summary><pre>'
        + lines.join('\n')
        + '</pre></details>';
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
