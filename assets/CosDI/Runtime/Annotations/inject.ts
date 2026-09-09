import { ServiceKeyHint, TypeKey } from '../Token.ts';
import { addPropertyInject } from '../Internal/InjectMetadata.ts';

const BUILT_IN: unknown[] = [Object, Function, Array, String, Number, Boolean, Promise];

/** The field's declared type, when the project emits decorator metadata. */
function designType(target: object, propertyKey: string | symbol): TypeKey | undefined {
    const reflect = Reflect as unknown as { getMetadata?: (key: string, target: object, property: string | symbol) => unknown };
    if (typeof reflect.getMetadata !== 'function') {
        return undefined;
    }
    const type = reflect.getMetadata('design:type', target, propertyKey);
    if (typeof type !== 'function' || BUILT_IN.indexOf(type) >= 0) {
        return undefined;
    }
    return type as TypeKey;
}

function record(target: object, propertyKey: string | symbol, token?: TypeKey): void {
    const ctor = (target as { constructor: Function }).constructor;
    if (token === undefined) {
        addPropertyInject(ctor, {
            propertyKey,
            token: designType(target, propertyKey) as TypeKey,
            name: String(propertyKey),
        });
        return;
    }
    addPropertyInject(ctor, { propertyKey, token });
}

/**
 * Field injector. Cocos Creator does not compile parameter or constructor
 * decorators (it can leave `@` in the emitted JS). Use `@injectable(token)` on
 * the class for constructor dependencies.
 *
 * Name the key, or let the field name say it:
 *
 * ```ts
 * @inject
 * private playerService: PlayerService;      // the class of the same name
 *
 * @inject(IExampleService)
 * private exampleService: IExampleService;   // a generated interface token
 * ```
 *
 * Creator compiles no decorator metadata, so a bare `@inject` goes on the field
 * name, matching it against the names classes and tokens registered under:
 * `playerService` finds `PlayerService`, then `IPlayerService`. A class
 * registers under `Class.name`, which a minifier rewrites, so name the key for
 * a class-typed field in a minified build. Token names are string literals and
 * come through minification unchanged.
 */
export function inject(target: object, propertyKey: string | symbol): void;
export function inject(): PropertyDecorator;
export function inject(serviceKey: ServiceKeyHint): PropertyDecorator;
export function inject(token: TypeKey): PropertyDecorator;
export function inject(
    tokenOrTarget?: TypeKey | object,
    propertyKey?: string | symbol,
): PropertyDecorator | void {
    if (propertyKey !== undefined && tokenOrTarget !== null && typeof tokenOrTarget === 'object') {
        record(tokenOrTarget, propertyKey);
        return undefined;
    }
    const token = tokenOrTarget as TypeKey | undefined;
    return (target: object, key: string | symbol) => record(target, key, token);
}
