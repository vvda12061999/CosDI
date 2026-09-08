import { Component, Constructor, Node, Prefab } from 'cc';
import { RegistrationBuilder } from '../RegistrationBuilder.ts';
import { Lifetime } from '../Lifetime.ts';
import { Registration } from '../Registration.ts';
import { IObjectResolver } from '../IObjectResolver.ts';
import { InjectorCache } from '../Internal/InjectorCache.ts';
import {
    ComponentDestination,
    createDestination,
    ExistingComponentProvider,
    FindComponentProvider,
    NewNodeProvider,
    PrefabComponentProvider,
} from './ComponentProviders.ts';

enum ComponentSource {
    Instance,
    Hierarchy,
    NewNode,
    Prefab,
}

export class ComponentRegistrationBuilder extends RegistrationBuilder {
    private readonly source: ComponentSource;
    private readonly instance: Component | null = null;
    private readonly prefabFinder: ((resolver: IObjectResolver) => Component | Prefab | Node) | null = null;
    private readonly nodeName: string | null = null;
    private readonly searchRoot: Node | null = null;
    private destination: ComponentDestination = createDestination();

    static fromInstance(instance: Component): ComponentRegistrationBuilder {
        const builder = new ComponentRegistrationBuilder(instance.constructor as Function, Lifetime.Singleton, ComponentSource.Instance);
        (builder as any).instance = instance;
        return builder;
    }

    static fromHierarchy(type: Constructor<Component>, searchRoot: Node | null): ComponentRegistrationBuilder {
        const builder = new ComponentRegistrationBuilder(type, Lifetime.Singleton, ComponentSource.Hierarchy);
        (builder as any).searchRoot = searchRoot;
        return builder;
    }

    static fromNewNode(type: Constructor<Component>, lifetime: Lifetime, nodeName: string | null): ComponentRegistrationBuilder {
        const builder = new ComponentRegistrationBuilder(type, lifetime, ComponentSource.NewNode);
        (builder as any).nodeName = nodeName;
        return builder;
    }

    static fromPrefab(
        prefabFinder: (resolver: IObjectResolver) => Component | Prefab | Node,
        type: Constructor<Component>,
        lifetime: Lifetime,
    ): ComponentRegistrationBuilder {
        const builder = new ComponentRegistrationBuilder(type, lifetime, ComponentSource.Prefab);
        (builder as any).prefabFinder = prefabFinder;
        return builder;
    }

    private constructor(type: Function, lifetime: Lifetime, source: ComponentSource) {
        super(type, lifetime);
        this.source = source;
    }

    build(): Registration {
        const injector = InjectorCache.getOrBuild(this.implementationType as Function);
        const type = this.implementationType as Constructor<Component>;
        let provider;
        switch (this.source) {
            case ComponentSource.Instance:
                provider = new ExistingComponentProvider(this.instance as Component, injector, this.parameters, this.destination.persistRoot);
                break;
            case ComponentSource.Hierarchy:
                provider = new FindComponentProvider(type, this.parameters, this.searchRoot, this.destination);
                break;
            case ComponentSource.Prefab:
                provider = new PrefabComponentProvider(
                    this.prefabFinder as (resolver: IObjectResolver) => Component | Prefab | Node,
                    type,
                    injector,
                    this.parameters,
                    this.destination,
                );
                break;
            default:
                provider = new NewNodeProvider(type, injector, this.parameters, this.destination, this.nodeName);
                break;
        }
        return new Registration(this.implementationType, this.lifetime, this.interfaceTypes, provider, this.key);
    }

    underNode(parent: Node): this {
        this.destination.parent = parent;
        return this;
    }

    underNodeFinder(parentFinder: (resolver: IObjectResolver) => Node | null): this {
        this.destination.parentFinder = parentFinder;
        return this;
    }

    persistRoot(): this {
        this.destination.persistRoot = true;
        return this;
    }
}
