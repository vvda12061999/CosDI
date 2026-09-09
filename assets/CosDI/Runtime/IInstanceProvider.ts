import { IObjectResolver } from './IObjectResolver.ts';
import { IInjectParameter } from './IInjectParameter.ts';

/**
 * What a provider leaves to the container. `constructor` means the container
 * builds the instance, so its constructor parameters, fields and injected
 * methods all have to resolve; `fields` means something else builds it and the
 * container only fills it in. Validation reads this to know what to check.
 */
export type ProviderInjection = 'none' | 'fields' | 'constructor';

export interface IInstanceProvider {
    spawnInstance(resolver: IObjectResolver): object;

    /** Left out means `none`: the provider brings an instance of its own. */
    readonly injection?: ProviderInjection;

    /** Values given with `withParameter`, which stand in for a registration. */
    readonly parameters?: readonly IInjectParameter[] | null;
}
