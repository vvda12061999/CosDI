import { RegisterInfo } from './RegisterInfo.ts';
import { ResolveInfo } from './ResolveInfo.ts';
import { DiagnosticsInfo } from './DiagnosticsInfo.ts';
import { DiagnosticsContext } from './DiagnosticsContext.ts';
import { Registration } from '../Runtime/Registration.ts';
import { RegistrationBuilder } from '../Runtime/RegistrationBuilder.ts';
import { Lifetime } from '../Runtime/Lifetime.ts';
import { CollectionInstanceProvider } from '../Runtime/Internal/InstanceProviders.ts';
import type { IObjectResolver } from '../Runtime/IObjectResolver.ts';

export class DiagnosticsCollector {
    private readonly diagnosticsInfos: DiagnosticsInfo[] = [];
    private readonly resolveCallStack: DiagnosticsInfo[] = [];
    parentScopeName = '';

    constructor(public readonly scopeName: string) {}

    getDiagnosticsInfos(): readonly DiagnosticsInfo[] {
        return this.diagnosticsInfos;
    }

    clear(): void {
        this.diagnosticsInfos.length = 0;
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
            const instance = resolving(registration);
            const elapsed = nowMs() - started;
            this.resolveCallStack.pop();

            setResolveTime(current, elapsed);
            current.resolveInfo.instanceCount += 1;
            return instance;
        }
        return resolving(registration);
    }

    notifyContainerBuilt(container: IObjectResolver): void {
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
