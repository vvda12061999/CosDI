import { DiagnosticsCollector } from './DiagnosticsCollector.ts';
import { DiagnosticsInfo } from './DiagnosticsInfo.ts';
import { Registration } from '../Runtime/Registration.ts';
import { typeKeyName } from '../Runtime/Token.ts';
import { Lifetime } from '../Runtime/Lifetime.ts';
import { cycleText } from '../Runtime/DependencyGraph.ts';
import type { DependencyGraph } from '../Runtime/DependencyGraph.ts';
import type { IObjectResolver } from '../Runtime/IObjectResolver.ts';

export interface DiagnosticsRegistrationSnapshot {
    type: string;
    lifetime: string;
    refCount: number;
    resolveTime: number;
    maxDepth: number;
    instanceCount: number;
    dependencies: string[];
}

export interface DiagnosticsGraphEdgeSnapshot {
    site: string;
    kind: string;
    status: string;
    token: string;
    /** Indexes into the scope graph's nodes. Empty when nothing answers it. */
    targets: number[];
}

export interface DiagnosticsGraphNodeSnapshot {
    id: number;
    name: string;
    lifetime: string;
    source: string;
    scope: string;
    contracts: string[];
    edges: DiagnosticsGraphEdgeSnapshot[];
    dependents: number[];
}

export interface DiagnosticsGraphSnapshot {
    nodes: DiagnosticsGraphNodeSnapshot[];
    roots: number[];
    cycles: string[];
}

export interface DiagnosticsScopeSnapshot {
    scopeName: string;
    parentScopeName: string;
    registrations: DiagnosticsRegistrationSnapshot[];
    /** What the container was built with, before anything is resolved. */
    graph?: DiagnosticsGraphSnapshot;
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
let publishingPaused = 0;

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
        publishDiagnosticsSnapshot(true);
    }

    static pausePublishing(): void {
        publishingPaused += 1;
    }

    static resumePublishing(): void {
        publishingPaused = Math.max(0, publishingPaused - 1);
        if (publishingPaused === 0) {
            publishDiagnosticsSnapshot(true);
        }
    }

    static isPublishingPaused(): boolean {
        return publishingPaused > 0;
    }

    static schedulePublish(): void {
        if (publishingPaused > 0) {
            return;
        }
        if (publishTimer != null) {
            return;
        }
        publishTimer = setTimeout(() => {
            publishTimer = null;
            publishDiagnosticsSnapshot();
        }, 250);
    }

    static toJSON(): DiagnosticsSnapshot {
        const scopes: DiagnosticsScopeSnapshot[] = [];
        const parentByName = new Map<string, string>();
        const graphByName = new Map<string, DiagnosticsGraphSnapshot | undefined>();
        collectors.forEach((collector) => {
            parentByName.set(collector.scopeName, collector.parentScopeName || '');
            graphByName.set(collector.scopeName, graphSnapshot(collector.dependencyGraph));
        });

        this.getGroupedDiagnosticsInfos().forEach((infos, scopeName) => {
            scopes.push({
                scopeName,
                parentScopeName: parentByName.get(scopeName) || '',
                graph: graphByName.get(scopeName),
                registrations: infos.map((info) => ({
                    type: typeKeyName(info.registerInfo.registrationBuilder.implementationType),
                    lifetime: info.resolveInfo
                        ? Lifetime[info.resolveInfo.registration.lifetime]
                        : '',
                    refCount: info.resolveInfo?.refCount ?? 0,
                    resolveTime: info.resolveInfo?.resolveTime ?? 0,
                    maxDepth: info.resolveInfo?.maxDepth ?? -1,
                    instanceCount: info.resolveInfo?.instanceCount ?? 0,
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
                    graph: graphByName.get(collector.scopeName),
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

/** Flattens the graph to names and indexes, which is all the panel can read. */
function graphSnapshot(graph: DependencyGraph | null): DiagnosticsGraphSnapshot | undefined {
    if (!graph || graph.nodes.length === 0) {
        return undefined;
    }
    return {
        nodes: graph.nodes.map((node) => ({
            id: node.id,
            name: node.name,
            lifetime: Lifetime[node.lifetime],
            source: node.source,
            scope: node.scope,
            contracts: node.contracts.filter((contract) => contract !== node.type).map(typeKeyName),
            dependents: node.dependents.map((dependent) => dependent.id),
            edges: node.edges.map((edge) => ({
                site: edge.site,
                kind: edge.kind,
                status: edge.status,
                token: edge.token == null ? edge.name : typeKeyName(edge.token),
                targets: edge.targets.map((target) => target.id),
            })),
        })),
        roots: graph.roots.map((node) => node.id),
        cycles: graph.cycles.map(cycleText),
    };
}

function publishDiagnosticsSnapshot(force = false): void {
    if (!force && publishingPaused > 0) {
        return;
    }
    const snapshot = DiagnosticsContext.toJSON();
    const g = globalThis as any;
    g.__COSDI_DIAGNOSTICS__ = snapshot;
    for (const listener of snapshotListeners) {
        listener(snapshot);
    }
}
