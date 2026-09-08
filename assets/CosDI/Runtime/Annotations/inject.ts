import { ServiceKeyHint, TypeKey } from '../Token.ts';
import { addPropertyInject } from '../Internal/InjectMetadata.ts';

/**
 * Field injector. Cocos Creator does not compile parameter or constructor
 * decorators (it can leave `@` in the emitted JS). Use `@injectable(token)` on
 * the class for constructor dependencies.
 *
 * The key is a class, a token, or the name of an interface:
 *
 * ```ts
 * @inject('IExampleService')
 * private exampleService: IExampleService;
 * ```
 */
export function inject(serviceKey: ServiceKeyHint): PropertyDecorator;
export function inject(token: TypeKey): PropertyDecorator;
export function inject(token: TypeKey): PropertyDecorator {
    return (target: object, propertyKey: string | symbol) => {
        const ctor = (target as { constructor: Function }).constructor;
        addPropertyInject(ctor, { propertyKey, token });
    };
}
