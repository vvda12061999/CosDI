import { IInstanceProvider } from '../IInstanceProvider';
import { IInjector } from '../IInjector';
import { IInjectParameter } from '../IInjectParameter';
import { IObjectResolver, IScopedObjectResolver } from '../IObjectResolver';
import { Registration } from '../Registration';
import { Lifetime } from '../Lifetime';
import { CosDIException } from '../CosDIException';
import { TypeKey, typeKeyName } from '../Token';
import { ContainerLocal } from './ContainerLocal';

export class InstanceProvider implements IInstanceProvider {
    constructor(
        private readonly injector: IInjector,
        private readonly customParameters: readonly IInjectParameter[] | null = null,
    ) {}

    spawnInstance(resolver: IObjectResolver): object {
        return this.injector.createInstance(resolver, this.customParameters);
    }
}

export class ExistingInstanceProvider implements IInstanceProvider {
    constructor(private readonly implementationInstance: object) {}

    spawnInstance(_resolver: IObjectResolver): object {
        return this.implementationInstance;
    }
}

export class FuncInstanceProvider implements IInstanceProvider {
    constructor(private readonly implementationProvider: (resolver: IObjectResolver) => object) {}

    spawnInstance(resolver: IObjectResolver): object {
        return this.implementationProvider(resolver);
    }
}

export class ContainerInstanceProvider implements IInstanceProvider {
    static readonly Default = new ContainerInstanceProvider();

    spawnInstance(resolver: IObjectResolver): object {
        return resolver;
    }
}

export interface RegistrationElement {
    registration: Registration;
    registeredContainer: IObjectResolver;
}

export const COLLECTION_ANY_KEY: object = { __cosdiCollectionAny: true };

export class CollectionInstanceProvider implements IInstanceProvider, Iterable<Registration> {
    readonly elementType: TypeKey;
    private readonly registrations: Registration[] = [];

    constructor(elementType: TypeKey) {
        this.elementType = elementType;
    }

    [Symbol.iterator](): Iterator<Registration> {
        return this.registrations[Symbol.iterator]();
    }

    add(registration: Registration): void {
        for (const existing of this.registrations) {
            if (
                existing.lifetime === Lifetime.Singleton &&
                existing.implementationType === registration.implementationType &&
                existing.key === registration.key
            ) {
                throw new CosDIException(
                    registration.implementationType,
                    `Conflict implementation type : ${registration}`,
                );
            }
        }
        this.registrations.push(registration);
    }

    spawnInstance(resolver: IObjectResolver): object {
        if (isScopedResolver(resolver)) {
            const entirely: RegistrationElement[] = [];
            this.collectFromParentScopes(resolver, entirely);
            return this.spawnFromElements(resolver, entirely);
        }
        return this.spawnLocal(resolver);
    }

    spawnLocal(resolver: IObjectResolver): object[] {
        return this.registrations.map((registration) => resolver.resolve(registration));
    }

    spawnFromElements(currentScope: IObjectResolver, entirelyRegistrations: readonly RegistrationElement[]): object[] {
        return entirelyRegistrations.map((element) => {
            const resolver =
                element.registration.lifetime === Lifetime.Singleton
                    ? element.registeredContainer
                    : currentScope;
            return resolver.resolve(element.registration);
        });
    }

    collectFromParentScopes(
        scope: IScopedObjectResolver,
        buffer: RegistrationElement[],
        localScopeOnly = false,
    ): void {
        for (const registration of this.registrations) {
            buffer.push({ registration, registeredContainer: scope });
        }

        let parent = scope.parent;
        while (parent != null) {
            const found = parent.tryGetRegistration(this.elementType, COLLECTION_ANY_KEY);
            const provider = found?.provider;
            if (provider instanceof CollectionInstanceProvider) {
                for (const x of provider.registrations) {
                    if (!localScopeOnly || x.lifetime !== Lifetime.Singleton) {
                        buffer.push({ registration: x, registeredContainer: parent });
                    }
                }
            } else {
                const collection = parent.tryGetRegistration(collectionContract(this.elementType));
                if (collection?.provider instanceof CollectionInstanceProvider) {
                    for (const x of collection.provider.registrations) {
                        if (!localScopeOnly || x.lifetime !== Lifetime.Singleton) {
                            buffer.push({ registration: x, registeredContainer: parent });
                        }
                    }
                }
            }
            parent = parent.parent;
        }
    }

    toString(): string {
        return `CollectionRegistration ${typeKeyName(this.elementType)}`;
    }
}

export class ContainerLocalInstanceProvider implements IInstanceProvider {
    constructor(
        private readonly valueRegistration: Registration,
    ) {}

    spawnInstance(resolver: IObjectResolver): object {
        return new ContainerLocal(resolver.resolve(this.valueRegistration));
    }
}

export function collectionContract(elementType: TypeKey): TypeKey {
    return elementType;
}

function isScopedResolver(resolver: IObjectResolver): resolver is IScopedObjectResolver {
    return 'parent' in resolver && 'root' in resolver;
}
