import { DiagnosticsCollector } from '../Diagnostics/DiagnosticsCollector.ts';
import { Registration } from './Registration.ts';
import { TypeKey, createToken } from './Token.ts';
import { IDisposable } from './IDisposable.ts';
import type { IContainerBuilder } from './ContainerBuilder.ts';

export const ObjectResolverToken = createToken<IObjectResolver>('IObjectResolver');

export interface IObjectResolver extends IDisposable {
    readonly applicationOrigin: object | null;
    diagnostics: DiagnosticsCollector | null;

    resolve(type: TypeKey, key?: object): object;
    resolve(registration: Registration): object;
    tryResolve(type: TypeKey, key?: object): object | null;
    createScope(installation?: ((builder: IContainerBuilder) => void) | null): IScopedObjectResolver;
    inject(instance: object): void;
    tryGetRegistration(type: TypeKey, key?: object): Registration | null;
    resolveAll(type: TypeKey, localOnly?: boolean): object[];
}

export interface IScopedObjectResolver extends IObjectResolver {
    readonly root: IObjectResolver;
    readonly parent: IScopedObjectResolver | null;
}
