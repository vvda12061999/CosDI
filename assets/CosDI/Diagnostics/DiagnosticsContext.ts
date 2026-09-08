import { DiagnosticsCollector } from './DiagnosticsCollector';
import { DiagnosticsInfo } from './DiagnosticsInfo';
import { Registration } from '../Runtime/Registration';
import { typeKeyName } from '../Runtime/Token';
import { Lifetime } from '../Runtime/Lifetime';
import type { IObjectResolver } from '../Runtime/IObjectResolver';

const collectors = new Map<string, DiagnosticsCollector>();
const listeners: Array<(container: IObjectResolver) => void> = [];

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

    static toJSON(): object {
        const scopes: Array<{
            scopeName: string;
            registrations: Array<{
                type: string;
                lifetime: string;
                refCount: number;
                resolveTime: number;
                maxDepth: number;
                instanceCount: number;
                dependencies: string[];
            }>;
        }> = [];

        this.getGroupedDiagnosticsInfos().forEach((infos, scopeName) => {
            scopes.push({
                scopeName,
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

        return { scopes, collectedAt: Date.now() };
    }
}

function publishDiagnosticsSnapshot(): void {
    const g = globalThis as any;
    g.__COSDI_DIAGNOSTICS__ = DiagnosticsContext.toJSON();
}
