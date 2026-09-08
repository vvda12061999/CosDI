import { DiagnosticsCollector } from './DiagnosticsCollector';
import { DiagnosticsInfo } from './DiagnosticsInfo';
import { Registration } from '../Runtime/Registration';
import { typeKeyName } from '../Runtime/Token';
import { Lifetime } from '../Runtime/Lifetime';
import type { IObjectResolver } from '../Runtime/IObjectResolver';

export interface DiagnosticsRegistrationSnapshot {
    type: string;
    lifetime: string;
    refCount: number;
    resolveTime: number;
    maxDepth: number;
    instanceCount: number;
    dependencies: string[];
}

export interface DiagnosticsScopeSnapshot {
    scopeName: string;
    parentScopeName: string;
    registrations: DiagnosticsRegistrationSnapshot[];
}

export interface DiagnosticsBenchmarkRow {
    name: string;
    sampleGroup: string;
    n: number;
    medianMs: number;
    meanMs: number;
    minMs: number;
    maxMs: number;
    nsPerResolve: number;
    heapDeltaKb: number | null;
}

export interface DiagnosticsBenchmarkSnapshot {
    status: 'running' | 'done' | 'failed';
    title: string;
    detail: string;
    results: DiagnosticsBenchmarkRow[];
}

export interface DiagnosticsSnapshot {
    scopes: DiagnosticsScopeSnapshot[];
    collectedAt: number;
    benchmark?: DiagnosticsBenchmarkSnapshot;
}

const collectors = new Map<string, DiagnosticsCollector>();
let currentBenchmark: DiagnosticsBenchmarkSnapshot | null = null;
const listeners: Array<(container: IObjectResolver) => void> = [];
const snapshotListeners: Array<(snapshot: DiagnosticsSnapshot) => void> = [];
let publishTimer: ReturnType<typeof setTimeout> | null = null;

export class DiagnosticsContext {
    static onContainerBuilt: ((container: IObjectResolver) => void) | null = null;

    static getCollector(name: string): DiagnosticsCollector {
        let collector = collectors.get(name);
        if (!collector) {
            collector = new DiagnosticsCollector(name);
            collectors.set(name, collector);
        }
        return collector;
    }

    static getDiagnosticsInfos(): DiagnosticsInfo[] {
        const result: DiagnosticsInfo[] = [];
        collectors.forEach((collector) => {
            result.push(...collector.getDiagnosticsInfos());
        });
        return result;
    }

    static getGroupedDiagnosticsInfos(): Map<string, DiagnosticsInfo[]> {
        const grouped = new Map<string, DiagnosticsInfo[]>();
        for (const info of this.getDiagnosticsInfos()) {
            if (info.resolveInfo && info.resolveInfo.maxDepth > 1) {
                continue;
            }
            let list = grouped.get(info.scopeName);
            if (!list) {
                list = [];
                grouped.set(info.scopeName, list);
            }
            list.push(info);
        }
        return grouped;
    }

    static notifyContainerBuilt(container: IObjectResolver): void {
        this.onContainerBuilt?.(container);
        for (const listener of listeners) {
            listener(container);
        }
        publishDiagnosticsSnapshot();
    }

    static findByRegistration(registration: Registration): DiagnosticsInfo | null {
        for (const info of this.getDiagnosticsInfos()) {
            if (info.resolveInfo?.registration === registration) {
                return info;
            }
        }
        return null;
    }

    static removeCollector(name: string): void {
        collectors.delete(name);
        publishDiagnosticsSnapshot();
    }

    static addListener(listener: (container: IObjectResolver) => void): void {
        listeners.push(listener);
    }

    static addSnapshotListener(listener: (snapshot: DiagnosticsSnapshot) => void): void {
        snapshotListeners.push(listener);
    }

    static setBenchmark(benchmark: DiagnosticsBenchmarkSnapshot | null): void {
        currentBenchmark = benchmark;
        publishDiagnosticsSnapshot();
    }

    static schedulePublish(): void {
        if (publishTimer != null) {
            return;
        }
        publishTimer = setTimeout(() => {
            publishTimer = null;
            publishDiagnosticsSnapshot();
        }, 100);
    }

    static toJSON(): DiagnosticsSnapshot {
        const scopes: DiagnosticsScopeSnapshot[] = [];
        const parentByName = new Map<string, string>();
        collectors.forEach((collector) => {
            parentByName.set(collector.scopeName, collector.parentScopeName || '');
        });

        this.getGroupedDiagnosticsInfos().forEach((infos, scopeName) => {
            scopes.push({
                scopeName,
                parentScopeName: parentByName.get(scopeName) || '',
                registrations: infos.map((info) => ({
                    type: typeKeyName(info.registerInfo.registrationBuilder.implementationType),
                    lifetime: info.resolveInfo
                        ? Lifetime[info.resolveInfo.registration.lifetime]
                        : '',
                    refCount: info.resolveInfo?.refCount ?? 0,
                    resolveTime: info.resolveInfo?.resolveTime ?? 0,
                    maxDepth: info.resolveInfo?.maxDepth ?? -1,
                    instanceCount: info.resolveInfo?.instances.length ?? 0,
                    dependencies: info.dependencies.map(
                        (d) => typeKeyName(d.registerInfo.registrationBuilder.implementationType),
                    ),
                })),
            });
        });

        collectors.forEach((collector) => {
            if (!scopes.some((scope) => scope.scopeName === collector.scopeName)) {
                scopes.push({
                    scopeName: collector.scopeName,
                    parentScopeName: collector.parentScopeName || '',
                    registrations: [],
                });
            }
        });

        return {
            scopes,
            collectedAt: Date.now(),
            benchmark: currentBenchmark || undefined,
        };
    }
}

function publishDiagnosticsSnapshot(): void {
    const snapshot = DiagnosticsContext.toJSON();
    const g = globalThis as any;
    g.__COSDI_DIAGNOSTICS__ = snapshot;
    for (const listener of snapshotListeners) {
        listener(snapshot);
    }
}
