import { Lifetime } from './Lifetime.ts';
import { TypeKey } from './Token.ts';
import { IInjectParameter } from './IInjectParameter.ts';
import { Registration } from './Registration.ts';
import { InjectorCache } from './Internal/InjectorCache.ts';
import { InstanceProvider } from './Internal/InstanceProviders.ts';
import {
    TypedParameter,
    FuncTypedParameter,
    NamedParameter,
    FuncNamedParameter,
} from './Internal/InjectParameter.ts';
import { IObjectResolver } from './IObjectResolver.ts';
import {
    IInitializable, IPostInitializable, IStartable, IPostStartable,
    ITickable, IPostTickable, ILateTickable, IAsyncStartable,
} from './Annotations/EntryPoints.ts';

export class RegistrationBuilder {
    protected interfaceTypes: TypeKey[] | null = null;
    protected parameters: IInjectParameter[] | null = null;
    key: object | undefined;

    constructor(
        public readonly implementationType: TypeKey,
        public readonly lifetime: Lifetime,
    ) {}

    build(): Registration {
        const injector = InjectorCache.getOrBuild(this.implementationType as Function);
        const spawner = new InstanceProvider(injector, this.parameters);
        return new Registration(
            this.implementationType,
            this.lifetime,
            this.interfaceTypes,
            spawner,
            this.key,
        );
    }

    asSelf(): this {
        this.addInterfaceType(this.implementationType);
        return this;
    }

    asImplementedInterfaces(): this {
        addEntryPointInterfaces(this);
        return this;
    }

    as(interfaceType: TypeKey): this;
    as(interfaceType1: TypeKey, interfaceType2: TypeKey): this;
    as(interfaceType1: TypeKey, interfaceType2: TypeKey, interfaceType3: TypeKey): this;
    as(...interfaceTypes: TypeKey[]): this {
        for (const interfaceType of interfaceTypes) {
            this.addInterfaceType(interfaceType);
        }
        return this;
    }

    withParameter(name: string, value: unknown): this;
    withParameter(name: string, value: (resolver: IObjectResolver) => unknown): this;
    withParameter(type: TypeKey, value: unknown): this;
    withParameter(type: TypeKey, value: (resolver: IObjectResolver) => unknown): this;
    withParameter(nameOrType: string | TypeKey, value: unknown | ((resolver: IObjectResolver) => unknown)): this {
        this.parameters = this.parameters ?? [];
        const isResolverFunc = typeof value === 'function' && (value as Function).length >= 1;
        if (typeof nameOrType === 'string') {
            if (isResolverFunc) {
                this.parameters.push(new FuncNamedParameter(nameOrType, value as (resolver: IObjectResolver) => unknown));
            } else {
                this.parameters.push(new NamedParameter(nameOrType, value));
            }
        } else if (isResolverFunc) {
            this.parameters.push(new FuncTypedParameter(nameOrType, value as (resolver: IObjectResolver) => unknown));
        } else {
            this.parameters.push(new TypedParameter(nameOrType, value));
        }
        return this;
    }

    keyed(key: object): this {
        this.key = key;
        return this;
    }

    getInterfaceTypes(): TypeKey[] | null {
        return this.interfaceTypes;
    }

    protected addInterfaceType(interfaceType: TypeKey): void {
        this.interfaceTypes = this.interfaceTypes ?? [];
        if (this.interfaceTypes.indexOf(interfaceType) < 0) {
            this.interfaceTypes.push(interfaceType);
        }
    }
}

function addEntryPointInterfaces(builder: RegistrationBuilder): void {
    const type = builder.implementationType;
    if (typeof type !== 'function') {
        builder.asSelf();
        return;
    }
    const proto = type.prototype;
    if (!proto) {
        builder.asSelf();
        return;
    }
    if (typeof proto.initialize === 'function') {
        builder.as(IInitializable);
    }
    if (typeof proto.postInitialize === 'function') {
        builder.as(IPostInitializable);
    }
    if (typeof proto.start === 'function') {
        builder.as(IStartable);
    }
    if (typeof proto.postStart === 'function') {
        builder.as(IPostStartable);
    }
    if (typeof proto.tick === 'function') {
        builder.as(ITickable);
    }
    if (typeof proto.postTick === 'function') {
        builder.as(IPostTickable);
    }
    if (typeof proto.lateTick === 'function') {
        builder.as(ILateTickable);
    }
    if (typeof proto.startAsync === 'function') {
        builder.as(IAsyncStartable);
    }
    builder.asSelf();
}
