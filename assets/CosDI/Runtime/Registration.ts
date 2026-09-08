import { Lifetime } from './Lifetime';
import { IInstanceProvider } from './IInstanceProvider';
import { IObjectResolver } from './IObjectResolver';
import { TypeKey, typeKeyName } from './Token';

export class Registration {
    readonly implementationType: TypeKey;
    readonly interfaceTypes: readonly TypeKey[] | null;
    readonly lifetime: Lifetime;
    readonly provider: IInstanceProvider;
    readonly key: object | undefined;

    constructor(
        implementationType: TypeKey,
        lifetime: Lifetime,
        interfaceTypes: readonly TypeKey[] | null,
        provider: IInstanceProvider,
        key?: object,
    ) {
        this.implementationType = implementationType;
        this.interfaceTypes = interfaceTypes;
        this.lifetime = lifetime;
        this.provider = provider;
        this.key = key;
    }

    spawnInstance(resolver: IObjectResolver): object {
        return this.provider.spawnInstance(resolver);
    }

    toString(): string {
        const contractTypes = this.interfaceTypes ? this.interfaceTypes.map(typeKeyName).join(', ') : '';
        const keyStr = this.key == null ? '' : ` (Key: ${this.key})`;
        return `Registration ${typeKeyName(this.implementationType)}${keyStr} ContractTypes=[${contractTypes}] ${Lifetime[this.lifetime]}`;
    }
}
