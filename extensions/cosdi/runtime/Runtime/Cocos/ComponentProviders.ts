import { Component, Node, Prefab, instantiate, Constructor, director, game } from 'cc';
import { IInstanceProvider } from '../IInstanceProvider';
import { IInjector } from '../IInjector';
import { IInjectParameter } from '../IInjectParameter';
import { IObjectResolver } from '../IObjectResolver';
import { CosDIException } from '../CosDIException';
import { typeKeyName, TypeKey } from '../Token';
import { CosDISettings } from './CosDISettings';
import { findComponentInNode, findComponentInScene } from './ObjectResolverCocosExtensions';

export interface ComponentDestination {
    parent: Node | null;
    parentFinder: ((resolver: IObjectResolver) => Node | null) | null;
    persistRoot: boolean;
}

export function createDestination(): ComponentDestination {
    return { parent: null, parentFinder: null, persistRoot: false };
}

export function getParent(destination: ComponentDestination, resolver: IObjectResolver): Node | null {
    if (destination.parent) {
        return destination.parent;
    }
    if (destination.parentFinder) {
        return destination.parentFinder(resolver);
    }
    return null;
}

export function applyPersistIfNeeded(destination: ComponentDestination, node: Node): void {
    if (destination.persistRoot) {
        game.addPersistRootNode(node);
    }
}

export class ExistingComponentProvider implements IInstanceProvider {
    constructor(
        private readonly instance: Component,
        private readonly injector: IInjector,
        private readonly parameters: readonly IInjectParameter[] | null,
        private readonly persistRoot: boolean,
    ) {}

    spawnInstance(resolver: IObjectResolver): object {
        this.injector.inject(this.instance, resolver, this.parameters);
        if (this.persistRoot) {
            game.addPersistRootNode(this.instance.node);
        }
        return this.instance;
    }
}

export class FindComponentProvider implements IInstanceProvider {
    constructor(
        private readonly implementationType: Constructor<Component>,
        private readonly parameters: readonly IInjectParameter[] | null,
        private readonly root: Node | null,
        private readonly destination: ComponentDestination,
    ) {}

    spawnInstance(resolver: IObjectResolver): object {
        const parent = getParent(this.destination, resolver);
        const searchRoot = parent ?? this.root;
        const component = searchRoot
            ? findComponentInNode(searchRoot, this.implementationType)
            : findComponentInScene(this.implementationType);
        if (!component) {
            throw new CosDIException(
                this.implementationType,
                `${typeKeyName(this.implementationType as TypeKey)} is not in the current hierarchy.`,
            );
        }
        resolver.inject(component);
        applyPersistIfNeeded(this.destination, component.node);
        return component;
    }
}

export class NewNodeProvider implements IInstanceProvider {
    constructor(
        private readonly implementationType: Constructor<Component>,
        private readonly injector: IInjector,
        private readonly parameters: readonly IInjectParameter[] | null,
        private readonly destination: ComponentDestination,
        private readonly nodeName: string | null,
    ) {}

    spawnInstance(resolver: IObjectResolver): object {
        const node = new Node(this.nodeName ?? this.implementationType.name);
        const parent = getParent(this.destination, resolver);
        if (parent) {
            parent.addChild(node);
        } else {
            const scene = director.getScene();
            scene?.addChild(node);
        }
        const component = node.addComponent(this.implementationType);
        this.injector.inject(component, resolver, this.parameters);
        applyPersistIfNeeded(this.destination, node);
        return component;
    }
}

export class PrefabComponentProvider implements IInstanceProvider {
    constructor(
        private readonly prefabFinder: (resolver: IObjectResolver) => Component | Prefab | Node,
        private readonly implementationType: Constructor<Component>,
        private readonly injector: IInjector,
        private readonly parameters: readonly IInjectParameter[] | null,
        private readonly destination: ComponentDestination,
    ) {}

    spawnInstance(resolver: IObjectResolver): object {
        const prefab = this.prefabFinder(resolver);
        let instanceNode: Node;
        if (prefab instanceof Component) {
            instanceNode = instantiate(prefab.node);
        } else {
            instanceNode = instantiate(prefab as Prefab | Node) as Node;
        }
        if (CosDISettings.removeClonePostfix) {
            instanceNode.name = instanceNode.name.replace(/\(Clone\)$/, '').trim();
        }
        const parent = getParent(this.destination, resolver);
        if (parent) {
            parent.addChild(instanceNode);
        }
        const component = instanceNode.getComponent(this.implementationType) ?? instanceNode.addComponent(this.implementationType);
        this.injector.inject(component, resolver, this.parameters);
        applyPersistIfNeeded(this.destination, instanceNode);
        return component;
    }
}
