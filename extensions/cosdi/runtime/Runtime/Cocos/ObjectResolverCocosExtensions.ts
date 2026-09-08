import { Component, Node, Prefab, instantiate, director, Constructor } from 'cc';
import { IObjectResolver } from '../IObjectResolver.ts';
import { InjectorCache } from '../Internal/InjectorCache.ts';
import { getInjectTypeInfo } from '../Internal/InjectMetadata.ts';
import { CosDISettings } from './CosDISettings.ts';

export function hasInjectMetadata(type: Function): boolean {
    const info = getInjectTypeInfo(type);
    return info.properties.length > 0 || info.methods.length > 0 || info.constructorParams.length > 0;
}

export function injectNode(resolver: IObjectResolver, node: Node): void {
    const components = node.getComponents(Component);
    for (const component of components) {
        if (component && hasInjectMetadata(component.constructor)) {
            resolver.inject(component);
        }
    }
    for (const child of node.children) {
        injectNode(resolver, child);
    }
}

export function injectScene(resolver: IObjectResolver, root?: Node): void {
    const scene = root ?? director.getScene();
    if (!scene) {
        return;
    }
    injectNode(resolver, scene);
}

function stripClonePostfix(name: string): string {
    return name.replace(/\(Clone\)$/, '').trim();
}

export function instantiateAndInject<T extends Component>(
    resolver: IObjectResolver,
    prefab: Prefab | Node | T,
    parent?: Node | null,
): T {
    let componentType: Constructor<T> | null = null;
    let instance: Node;

    if (prefab instanceof Component) {
        componentType = prefab.constructor as Constructor<T>;
        instance = instantiate(prefab.node) as Node;
    } else {
        instance = instantiate(prefab as Prefab | Node) as Node;
    }

    if (CosDISettings.removeClonePostfix) {
        instance.name = stripClonePostfix(instance.name);
    }
    if (parent) {
        parent.addChild(instance);
    }
    injectNode(resolver, instance);

    if (componentType) {
        return instance.getComponent(componentType) as T;
    }
    return instance.getComponent(Component) as T;
}

export function instantiateNode(resolver: IObjectResolver, prefab: Prefab | Node, parent?: Node | null): Node {
    const instance = instantiate(prefab) as Node;
    if (CosDISettings.removeClonePostfix) {
        instance.name = stripClonePostfix(instance.name);
    }
    if (parent) {
        parent.addChild(instance);
    }
    injectNode(resolver, instance);
    return instance;
}

export function findComponentInNode<T extends Component>(node: Node, type: Constructor<T>): T | null {
    const found = node.getComponent(type);
    if (found) {
        return found as T;
    }
    for (const child of node.children) {
        const nested = findComponentInNode(child, type);
        if (nested) {
            return nested;
        }
    }
    return null;
}

export function findComponentInScene<T extends Component>(type: Constructor<T>, root?: Node): T | null {
    const scene = root ?? director.getScene();
    if (!scene) {
        return null;
    }
    return findComponentInNode(scene, type);
}

export function injectExistingComponent(resolver: IObjectResolver, component: Component): void {
    const injector = InjectorCache.getOrBuild(component.constructor);
    injector.inject(component, resolver, null);
}
