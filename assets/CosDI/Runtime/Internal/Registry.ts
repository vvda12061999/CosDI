import { Registration } from '../Registration.ts';
import { TypeKey } from '../Token.ts';
import { Lifetime } from '../Lifetime.ts';
import { CollectionInstanceProvider, COLLECTION_ANY_KEY } from './InstanceProviders.ts';

const NULL_KEY: object = { __cosdiNullKey: true };

class TypeKeyTable<T> {
    private readonly table = new Map<TypeKey, Map<object, T>>();

    set(type: TypeKey, key: object | undefined, value: T): void {
        let inner = this.table.get(type);
        if (!inner) {
            inner = new Map<object, T>();
            this.table.set(type, inner);
        }
        inner.set(key ?? NULL_KEY, value);
    }

    get(type: TypeKey, key: object | undefined): T | undefined {
        return this.table.get(type)?.get(key ?? NULL_KEY);
    }

    has(type: TypeKey, key: object | undefined): boolean {
        return this.table.get(type)?.has(key ?? NULL_KEY) ?? false;
    }
}

export class Registry {
    private constructor(
        private readonly table: TypeKeyTable<Registration>,
        private readonly collections: Map<TypeKey, CollectionInstanceProvider>,
    ) {}

    static build(registrations: Registration[]): Registry {
        const table = new TypeKeyTable<Registration>();
        const collections = new Map<TypeKey, CollectionInstanceProvider>();

        for (const registration of registrations) {
            if (registration.interfaceTypes && registration.interfaceTypes.length > 0) {
                for (const interfaceType of registration.interfaceTypes) {
                    add(table, collections, interfaceType, registration);
                }
                if (!table.has(registration.implementationType, registration.key)) {
                    table.set(registration.implementationType, registration.key, registration);
                }
            } else {
                add(table, collections, registration.implementationType, registration);
            }
        }

        return new Registry(table, collections);
    }

    tryGet(interfaceType: TypeKey, key?: object): Registration | null {
        if (key === COLLECTION_ANY_KEY) {
            const collection = this.getCollectionRegistration(interfaceType);
            return collection;
        }
        const registration = this.table.get(interfaceType, key);
        return registration ?? null;
    }

    exists(type: TypeKey, key?: object): boolean {
        if (key === COLLECTION_ANY_KEY) {
            return this.collections.has(type) || this.table.has(type, undefined);
        }
        return this.table.get(type, key) != null;
    }

    getCollectionRegistration(elementType: TypeKey): Registration | null {
        const collection = this.collections.get(elementType);
        if (collection) {
            return new Registration(elementType, Lifetime.Transient, [elementType], collection, COLLECTION_ANY_KEY);
        }
        const single = this.table.get(elementType, undefined);
        if (single) {
            const provider = new CollectionInstanceProvider(elementType);
            provider.add(single);
            return new Registration(elementType, Lifetime.Transient, [elementType], provider, COLLECTION_ANY_KEY);
        }
        return null;
    }
}

function add(
    table: TypeKeyTable<Registration>,
    collections: Map<TypeKey, CollectionInstanceProvider>,
    service: TypeKey,
    registration: Registration,
): void {
    table.set(service, registration.key, registration);

    let collection = collections.get(service);
    if (!collection) {
        collection = new CollectionInstanceProvider(service);
        collections.set(service, collection);
    }
    collection.add(registration);
}
