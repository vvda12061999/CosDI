export class Component {
    node: any = null;
    onLoad?(): void;
    onDestroy?(): void;
}
export class Node {
    name = 'node';
    parent: any = null;
    children: any[] = [];
    active = true;
    getComponent(t: any): any { return this.components.find((c) => c instanceof t) ?? null; }
    getComponents(t: any): any[] { return this.components.filter((c) => c instanceof t); }
    getComponentInChildren(_t: any): any { return null; }
    getComponentsInChildren(_t: any): any[] { return []; }
    addComponent(t: any): any { const c = new t(); c.node = this; this.components.push(c); return c; }
    components: any[] = [];
    addChild(_n: any): void {}
    destroy(): void {}
}
export class Scene extends Node {}
export class Prefab {}
/**
 * Stands in for a Cocos decorator in every shape it is written: `@ccclass`,
 * `@ccclass('Name')`, `@property`, `@property(Node)`. Returning nothing leaves
 * the class or member exactly as it was, which is all a test needs.
 */
function passthrough(...args: any[]): any {
    const usedDirectly = args.length >= 2 || (args.length === 1 && typeof args[0] === 'function' && args[0].prototype);
    return usedDirectly ? undefined : () => undefined;
}
export const _decorator: any = { ccclass: passthrough, property: passthrough, executeInEditMode: passthrough, menu: passthrough, disallowMultiple: passthrough, executionOrder: passthrough, requireComponent: passthrough, help: passthrough, playOnFocus: passthrough, type: passthrough, integer: passthrough, float: passthrough, boolean: passthrough, string: passthrough };
export const director: any = { on: () => {}, off: () => {}, getScene: () => null, once: () => {} };
export const instantiate: any = (v: any) => v;
export const game: any = { on: () => {}, off: () => {} };
export const sys: any = { isBrowser: false, isNative: false, os: 'Linux', platform: 'DESKTOP_BROWSER' };
export const view: any = { getVisibleSize: () => ({ width: 960, height: 640 }), on: () => {} };
export const screen: any = { on: () => {} };
export const input: any = { on: () => {}, off: () => {} };
export const Input: any = { EventType: { KEY_DOWN: 'key-down' } };
export const KeyCode: any = {};
export const EventKeyboard: any = class {};
export const Label: any = class {};
export const Canvas: any = class {};
export const UITransform: any = class {};
export const Widget: any = class {};
export const Color: any = class { constructor(..._a: any[]) {} };
export const Layers: any = { Enum: { UI_2D: 1 << 25 } };
export const Sprite: any = class {};
export const Graphics: any = class {};
export const UIOpacity: any = class {};
export const BlockInputEvents: any = class {};
export const Vec3: any = class { constructor(..._a: any[]) {} };
export const Size: any = class { constructor(..._a: any[]) {} };
export const CCObject: any = class {};
export const isValid: any = (v: any) => v != null;
export const warn: any = console.warn;
export const error: any = console.error;
export const log: any = console.log;
export const find: any = () => null;
export const macro: any = {};
export const Enum: any = (v: any) => v;
export const CCInteger: any = class {};
export const CCFloat: any = class {};
export const CCBoolean: any = class {};
export const CCString: any = class {};
export const EDITOR = false;
export const DEV = false;
