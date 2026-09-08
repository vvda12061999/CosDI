import { IObjectResolver } from './IObjectResolver.ts';
import { TypeKey, typeKeyName } from './Token.ts';
import { CosDIException } from './CosDIException.ts';

export class AmbientResolver {
    private static readonly stack: IObjectResolver[] = [];
    static constructing = false;

    static get current(): IObjectResolver | null {
        return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
    }

    static push(resolver: IObjectResolver): void {
        this.stack.push(resolver);
    }

    static pop(resolver?: IObjectResolver): void {
        if (resolver) {
            const index = this.stack.lastIndexOf(resolver);
            if (index >= 0) {
                this.stack.splice(index, 1);
                return;
            }
        }
        this.stack.pop();
    }

    static require(type: TypeKey): IObjectResolver {
        const current = this.current;
        if (!current) {
            throw new CosDIException(
                type,
                `No active LifetimeScope to resolve ${typeKeyName(type)}. Attach a LifetimeScope and register the type.`,
            );
        }
        return current;
    }
}
