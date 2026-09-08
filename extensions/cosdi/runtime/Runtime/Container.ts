import { DiagnosticsCollector } from '../Diagnostics/DiagnosticsCollector';
import { Registration } from './Registration';
import { IObjectResolver, IScopedObjectResolver } from './IObjectResolver';
import { TypeKey, typeKeyName } from './Token';
import { Lifetime } from './Lifetime';
import { Registry } from './Internal/Registry';
import { CompositeDisposable, Lazy } from './Internal/CompositeDisposable';
import { InjectorCache } from './Internal/InjectorCache';
import { ExistingInstanceProvider, COLLECTION_ANY_KEY, CollectionInstanceProvider } from './Internal/InstanceProviders';
import { CosDIException } from './CosDIException';
import { IContainerBuilder, ScopedContainerBuilder } from './ContainerBuilder';
import { isDisposable } from './IDisposable';
import { isRegistration } from './IObjectResolverExtensions';

export class ScopedContainer implements IScopedObjectResolver {
    readonly root: IObjectResolver;
    readonly parent: IScopedObjectResolver | null;
    readonly applicationOrigin: object | null;
    diagnostics: DiagnosticsCollector | null = null;

    private readonly registry: Registry;
    private readonly sharedInstances = new Map<Registration, Lazy<object>>();
    private readonly disposables = new CompositeDisposable();

    constructor(
        registry: Registry,
        root: IObjectResolver,
        parent: IScopedObjectResolver | null = null,
        applicationOrigin: object | null = null,
    ) {
        this.registry = registry;
        this.root = root;
        this.parent = parent;
        this.applicationOrigin = applicationOrigin;
    }

    resolve(typeOrRegistration: TypeKey | Registration, key?: object): object {
        if (isRegistration(typeOrRegistration)) {
            return this.resolveRegistration(typeOrRegistration);
        }
        const registration = this.tryFindRegistration(typeOrRegistration, key);
        if (!registration) {
            throw new CosDIException(
                typeOrRegistration,
                `No such registration of type: ${typeKeyName(typeOrRegistration)}${key == null ? '' : ` with Key: ${key}`}`,
            );
        }
        return this.resolveRegistration(registration);
    }

    tryResolve(type: TypeKey, key?: object): object | null {
        const registration = this.tryFindRegistration(type, key);
        if (!registration) {
            return null;
        }
        return this.resolveRegistration(registration);
    }

    resolveAll(type: TypeKey, localOnly = false): object[] {
        const collection = this.tryFindRegistration(type, COLLECTION_ANY_KEY) ?? this.registry.tryGet(type, COLLECTION_ANY_KEY);
        if (!collection) {
            const single = this.tryFindRegistration(type);
            return single ? [this.resolveRegistration(single)] : [];
        }
        if (localOnly && collection.provider instanceof CollectionInstanceProvider) {
            return collection.provider.spawnLocal(this);
        }
        return this.resolveRegistration(collection) as object[];
    }

    createScope(installation?: ((builder: IContainerBuilder) => void) | null): IScopedObjectResolver {
        const containerBuilder = new ScopedContainerBuilder(this.root, this);
        containerBuilder.applicationOrigin = this.applicationOrigin;
        installation?.(containerBuilder);
        return containerBuilder.buildScope();
    }

    inject(instance: object): void {
        const injector = InjectorCache.getOrBuild(instance.constructor);
        injector.inject(instance, this, null);
    }

    tryGetRegistration(type: TypeKey, key?: object): Registration | null {
        return this.registry.tryGet(type, key);
    }

    dispose(): void {
        this.diagnostics?.clear();
        this.disposables.dispose();
        this.sharedInstances.clear();
    }

    private resolveRegistration(registration: Registration): object {
        if (this.diagnostics) {
            return this.diagnostics.traceResolve(registration, (r) => this.resolveCore(r));
        }
        return this.resolveCore(registration);
    }

    private resolveCore(registration: Registration): object {
        switch (registration.lifetime) {
            case Lifetime.Singleton:
                if (this.parent == null) {
                    return this.root.resolve(registration);
                }
                if (!this.registry.exists(registration.implementationType, registration.key)) {
                    return this.parent.resolve(registration);
                }
                return this.createTrackedInstance(registration);
            case Lifetime.Scoped:
                return this.createTrackedInstance(registration);
            default:
                return registration.spawnInstance(this);
        }
    }

    private createTrackedInstance(registration: Registration): object {
        let lazy = this.sharedInstances.get(registration);
        if (!lazy) {
            lazy = new Lazy(() => registration.spawnInstance(this));
            this.sharedInstances.set(registration, lazy);
        }
        const created = lazy.isValueCreated;
        const instance = lazy.value;
        if (!created && isDisposable(instance) && !(registration.provider instanceof ExistingInstanceProvider)) {
            this.disposables.add(instance);
        }
        return instance;
    }

    tryFindRegistration(type: TypeKey, key?: object): Registration | null {
        let scope: IScopedObjectResolver | null = this;
        while (scope != null) {
            const registration = scope.tryGetRegistration(type, key);
            if (registration) {
                return registration;
            }
            scope = scope.parent;
        }
        return null;
    }
}

export class Container implements IObjectResolver {
    readonly applicationOrigin: object | null;
    diagnostics: DiagnosticsCollector | null = null;

    private readonly registry: Registry;
    private readonly rootScope: IScopedObjectResolver;
    private readonly sharedInstances = new Map<Registration, Lazy<object>>();
    private readonly disposables = new CompositeDisposable();

    constructor(registry: Registry, applicationOrigin: object | null = null) {
        this.registry = registry;
        this.rootScope = new ScopedContainer(registry, this, null, applicationOrigin);
        this.applicationOrigin = applicationOrigin;
    }

    resolve(typeOrRegistration: TypeKey | Registration, key?: object): object {
        if (isRegistration(typeOrRegistration)) {
            return this.resolveRegistration(typeOrRegistration);
        }
        const registration = this.tryGetRegistration(typeOrRegistration, key);
        if (!registration) {
            throw new CosDIException(
                typeOrRegistration,
                `No such registration of type: ${typeKeyName(typeOrRegistration)}${key == null ? '' : ` with Key: ${key}`}`,
            );
        }
        return this.resolveRegistration(registration);
    }

    tryResolve(type: TypeKey, key?: object): object | null {
        const registration = this.tryGetRegistration(type, key);
        if (!registration) {
            return null;
        }
        return this.resolveRegistration(registration);
    }

    resolveAll(type: TypeKey, localOnly = false): object[] {
        const collection = this.registry.tryGet(type, COLLECTION_ANY_KEY);
        if (!collection) {
            const single = this.tryGetRegistration(type);
            return single ? [this.resolveRegistration(single)] : [];
        }
        if (localOnly && collection.provider instanceof CollectionInstanceProvider) {
            return collection.provider.spawnLocal(this);
        }
        return this.resolveRegistration(collection) as object[];
    }

    createScope(installation?: ((builder: IContainerBuilder) => void) | null): IScopedObjectResolver {
        return this.rootScope.createScope(installation);
    }

    inject(instance: object): void {
        const injector = InjectorCache.getOrBuild(instance.constructor);
        injector.inject(instance, this, null);
    }

    tryGetRegistration(type: TypeKey, key?: object): Registration | null {
        return this.registry.tryGet(type, key);
    }

    dispose(): void {
        this.diagnostics?.clear();
        this.rootScope.dispose();
        this.disposables.dispose();
        this.sharedInstances.clear();
    }

    private resolveRegistration(registration: Registration): object {
        if (this.diagnostics) {
            return this.diagnostics.traceResolve(registration, (r) => this.resolveCore(r));
        }
        return this.resolveCore(registration);
    }

    private resolveCore(registration: Registration): object {
        switch (registration.lifetime) {
            case Lifetime.Singleton: {
                let singleton = this.sharedInstances.get(registration);
                if (!singleton) {
                    singleton = new Lazy(() => registration.spawnInstance(this));
                    this.sharedInstances.set(registration, singleton);
                }
                if (!singleton.isValueCreated && isDisposable(singleton.value) && !(registration.provider instanceof ExistingInstanceProvider)) {
                    this.disposables.add(singleton.value);
                }
                return singleton.value;
            }
            case Lifetime.Scoped:
                return this.rootScope.resolve(registration);
            default:
                return registration.spawnInstance(this);
        }
    }
}
