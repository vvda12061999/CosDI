import { IObjectResolver } from './IObjectResolver.ts';
import { IInjectParameter } from './IInjectParameter.ts';

export interface IInjector {
    inject(instance: object, resolver: IObjectResolver, parameters: readonly IInjectParameter[] | null): void;
    createInstance(resolver: IObjectResolver, parameters: readonly IInjectParameter[] | null): object;
    resolveConstructorParams(resolver: IObjectResolver, parameters: readonly IInjectParameter[] | null): unknown[];
}
