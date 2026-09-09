import { RegisterInfo } from './RegisterInfo.ts';
import { ResolveInfo } from './ResolveInfo.ts';
import { DiagnosticsInfo } from './DiagnosticsInfo.ts';
import { DiagnosticsContext } from './DiagnosticsContext.ts';
import { Registration } from '../Runtime/Registration.ts';
import { RegistrationBuilder } from '../Runtime/RegistrationBuilder.ts';
import { Lifetime } from '../Runtime/Lifetime.ts';
import { CollectionInstanceProvider } from '../Runtime/Internal/InstanceProviders.ts';
import type { IObjectResolver } from '../Runtime/IObjectResolver.ts';
import type { DependencyGraph } from '../Runtime/DependencyGraph.ts';

/** A resolve that threw, kept so the panel can show it after the fact. */
export interface DiagnosticsFailure {
    message: string;
    /** Repeats collapse: a failure in an update loop would drown the rest. */
    count: number;
    at: number;
}

/** The scope nearest the failure records it; the ones it passes through skip. */
const recorded = new WeakSet<object>();
const KEPT_FAILURES = 20;

export class DiagnosticsCollector {
    private readonly diagnosticsInfos: DiagnosticsInfo[] = [];
    private readonly resolveCallStack: DiagnosticsInfo[] = [];
    private readonly failures: { error: Error; at: number }[] = [];
    parentScopeName = '';
    /** What the scope's container was built with, kept for the panel. */
    dependencyGraph: DependencyGraph | null = null;

    constructor(public readonly scopeName: string) {}

    getDiagnosticsInfos(): readonly DiagnosticsInfo[] {
        return this.diagnosticsInfos;
    }

    /**
     * Read late on purpose: a resolution failure writes its message once the
     * walk that led to it has unwound, which is after it was recorded.
     */
    getFailures(): DiagnosticsFailure[] {
        const collapsed = new Map<string, DiagnosticsFailure>();
        for (const failure of this.failures) {
            const message = `${failure.error.name}: ${failure.error.message}`;
            const existing = collapsed.get(message);
            if (existing) {
                existing.count += 1;
                existing.at = Math.max(existing.at, failure.at);
            } else {
                collapsed.set(message, { message, count: 1, at: failure.at });
            }
        }
        return Array.from(collapsed.values()).sort((a, b) => b.at - a.at);
    }

    clear(): void {
        this.diagnosticsInfos.length = 0;
        this.failures.length = 0;
    }

    /** Records a resolve that threw, once, in the scope closest to it. */
    traceFailure(error: unknown): void {
        if (!(error instanceof Error) || recorded.has(error)) {
            return;
        }
        recorded.add(error);
        this.failures.push({ error, at: Date.now() });
        if (this.failures.length > KEPT_FAILURES) {
            this.failures.shift();
        }
        DiagnosticsContext.schedulePublish();
    }

    traceRegister(registerInfo: RegisterInfo): void {
        this.diagnosticsInfos.push(new DiagnosticsInfo(this.scopeName, registerInfo));
    }

    traceBuild(registrationBuilder: RegistrationBuilder, registration: Registration): void {
        for (const info of this.diagnosticsInfos) {
            if (info.registerInfo.registrationBuilder === registrationBuilder) {
                info.resolveInfo = new ResolveInfo(registration);
                return;
            }
        }
    }

    traceResolve(registration: Registration, resolving: (registration: Registration) => object): object {
        const current = DiagnosticsContext.findByRegistration(registration);
        const owner = this.resolveCallStack.length > 0
            ? this.resolveCallStack[this.resolveCallStack.length - 1]
            : null;

        if (!(registration.provider instanceof CollectionInstanceProvider) && current != null && current !== owner) {
            if (!current.resolveInfo) {
                current.resolveInfo = new ResolveInfo(registration);
            }
            current.resolveInfo.refCount += 1;
            current.resolveInfo.maxDepth = current.resolveInfo.maxDepth < 0
                ? this.resolveCallStack.length
                : Math.max(current.resolveInfo.maxDepth, this.resolveCallStack.length);

            owner?.addDependency(current);

            this.resolveCallStack.push(current);
            const started = nowMs();
            let instance;
            try {
                instance = resolving(registration);
            } catch (ex) {
                this.traceFailure(ex);
                throw ex;
            } finally {
                // A throw halfway down would otherwise leave the stack deep,
                // and every resolve after it reading as a dependency of it.
                this.resolveCallStack.pop();
            }
            const elapsed = nowMs() - started;

            setResolveTime(current, elapsed);
            current.resolveInfo.instanceCount += 1;
            return instance;
        }
        try {
            return resolving(registration);
        } catch (ex) {
            this.traceFailure(ex);
            throw ex;
        }
    }

    notifyContainerBuilt(container: IObjectResolver): void {
        this.dependencyGraph = container.dependencyGraph ?? null;
        DiagnosticsContext.notifyContainerBuilt(container);
    }
}

function setResolveTime(current: DiagnosticsInfo, elapsedMilliseconds: number): void {
    if (!current.resolveInfo) {
        return;
    }
    const resolves = current.resolveInfo.refCount;
    let resolveTime = current.resolveInfo.resolveTime;
    switch (current.resolveInfo.registration.lifetime) {
        case Lifetime.Transient:
            resolveTime = (resolveTime * (resolves - 1) + elapsedMilliseconds) / Math.max(resolves, 1);
            break;
        case Lifetime.Scoped:
        case Lifetime.Singleton:
            if (elapsedMilliseconds > resolveTime) {
                resolveTime = elapsedMilliseconds;
            }
            break;
        default:
            break;
    }
    current.resolveInfo.resolveTime = resolveTime;
}

function nowMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}
