import * as cc from 'cc';
import { KeyCode } from 'cc';
import { CosDISettings } from '../Runtime/Cocos/CosDISettings.ts';
import { DiagnosticsContext, DiagnosticsSnapshot, DiagnosticsScopeSnapshot } from './DiagnosticsContext.ts';

const PANEL_ID = 'cosdi-diagnostics-overlay';

export class DiagnosticsOverlay {
    private static started = false;
    private static visible = true;
    private static lastSnapshot: DiagnosticsSnapshot = { scopes: [], collectedAt: 0 };

    static ensure(): void {
        if (!CosDISettings.enableDiagnostics || !CosDISettings.showDiagnosticsOverlay) {
            return;
        }
        if (this.started) {
            this.render(this.lastSnapshot);
            return;
        }
        this.started = true;
        DiagnosticsContext.addSnapshotListener((snapshot) => this.render(snapshot));
        this.bindToggle();
        this.render(DiagnosticsContext.toJSON());
        console.log('[CosDI] Diagnostics overlay ready. Press F3 to toggle.');
    }

    static toggle(): void {
        this.visible = !this.visible;
        this.render(this.lastSnapshot);
    }

    private static bindToggle(): void {
        bindEngineKeyDown((keyCode) => {
            if (keyCode === KeyCode.F3) {
                this.toggle();
            }
        });
        const doc = getDocument();
        if (doc) {
            doc.addEventListener('keydown', (event) => {
                if (event.key === 'F3') {
                    event.preventDefault();
                    this.toggle();
                }
            });
        }
    }

    private static render(snapshot: DiagnosticsSnapshot): void {
        this.lastSnapshot = snapshot;
        const doc = getDocument();
        if (!doc || !doc.body) {
            if (snapshot.scopes.length > 0) {
                console.log('[CosDI] Diagnostics', snapshot);
            }
            return;
        }

        let root = doc.getElementById(PANEL_ID);
        if (!this.visible) {
            if (root) {
                root.style.display = 'none';
            }
            return;
        }

        if (!root) {
            root = doc.createElement('div');
            root.id = PANEL_ID;
            doc.body.appendChild(root);
        }

        root.style.cssText = [
            'display:block',
            'position:fixed',
            'top:8px',
            'right:8px',
            'width:min(460px,42vw)',
            'max-height:calc(100vh - 16px)',
            'overflow:auto',
            'z-index:2147483646',
            'background:rgba(12,14,20,0.92)',
            'color:#e8ecf1',
            'font:12px/1.45 Consolas,Menlo,monospace',
            'border:1px solid #3d4a5c',
            'border-radius:8px',
            'padding:10px 12px',
            'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
            'pointer-events:auto',
        ].join(';');

        root.innerHTML = this.buildHtml(snapshot);
        const toggle = root.querySelector('[data-cosdi-toggle]');
        if (toggle) {
            toggle.addEventListener('click', () => this.toggle());
        }
    }

    private static buildHtml(snapshot: DiagnosticsSnapshot): string {
        if (!snapshot.scopes || snapshot.scopes.length === 0) {
            return headerHtml() + '<p style="opacity:.75;margin:8px 0 0">Waiting for a LifetimeScope to build…</p>';
        }

        const byParent = new Map<string, DiagnosticsScopeSnapshot[]>();
        for (const scope of snapshot.scopes) {
            const key = scope.parentScopeName || '';
            let list = byParent.get(key);
            if (!list) {
                list = [];
                byParent.set(key, list);
            }
            list.push(scope);
        }

        const roots = byParent.get('') || snapshot.scopes.filter((scope) => {
            return !scope.parentScopeName || !snapshot.scopes.some((other) => other.scopeName === scope.parentScopeName);
        });

        const renderScope = (scope: DiagnosticsScopeSnapshot, depth: number, visited: Set<string>): string => {
            if (visited.has(scope.scopeName)) {
                return '';
            }
            visited.add(scope.scopeName);
            const children = byParent.get(scope.scopeName) || [];
            const indent = depth * 14;
            const parentLabel = scope.parentScopeName ? ` ← ${escapeHtml(scope.parentScopeName)}` : ' (root)';
            const rows = (scope.registrations || []).map((reg) => {
                const deps = (reg.dependencies || []).join(', ');
                return `<tr>
                    <td>${escapeHtml(reg.type)}</td>
                    <td>${escapeHtml(reg.lifetime)}</td>
                    <td>${reg.refCount}</td>
                    <td>${escapeHtml(deps)}</td>
                </tr>`;
            }).join('');
            return `<article style="margin:0 0 10px ${indent}px">
                <h3 style="margin:0 0 6px;font-size:12px;color:#9cdcfe">${escapeHtml(scope.scopeName)}<span style="color:#8b949e;font-weight:normal">${escapeHtml(parentLabel)}</span></h3>
                <table style="width:100%;border-collapse:collapse">
                    <thead><tr style="text-align:left;color:#8b949e">
                        <th>Type</th><th>Life</th><th>#</th><th>Depends on</th>
                    </tr></thead>
                    <tbody>${rows || '<tr><td colspan="4" style="opacity:.7">No registrations yet</td></tr>'}</tbody>
                </table>
            </article>${children.map((child) => renderScope(child, depth + 1, visited)).join('')}`;
        };

        const visited = new Set<string>();
        const body = roots.map((scope) => renderScope(scope, 0, visited)).join('');

        return headerHtml() + (body || '<p style="opacity:.75">No scopes collected.</p>');
    }
}

function headerHtml(): string {
    return `<header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>CosDI Diagnostics</strong>
        <button data-cosdi-toggle type="button" style="cursor:pointer">Hide (F3)</button>
    </header>`;
}

function getDocument(): Document | null {
    const g = globalThis as any;
    return g.document && g.document.body ? g.document as Document : null;
}

function bindEngineKeyDown(listener: (keyCode: number) => void): void {
    const engine = cc as typeof cc & {
        input?: { on: (type: string, fn: (event: { keyCode: number }) => void) => void };
        Input?: { EventType: { KEY_DOWN: string } };
        systemEvent?: { on: (type: string, fn: (event: { keyCode: number }) => void) => void };
        SystemEvent?: { EventType: { KEY_DOWN: string } };
    };
    if (engine.input && engine.Input && engine.Input.EventType) {
        engine.input.on(engine.Input.EventType.KEY_DOWN, (event) => listener(event.keyCode));
        return;
    }
    if (engine.systemEvent && engine.SystemEvent && engine.SystemEvent.EventType) {
        engine.systemEvent.on(engine.SystemEvent.EventType.KEY_DOWN, (event) => listener(event.keyCode));
    }
}

function escapeHtml(value: string): string {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
