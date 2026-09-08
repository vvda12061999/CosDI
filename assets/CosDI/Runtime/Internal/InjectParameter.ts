import { IInjectParameter } from '../IInjectParameter.ts';
import { IObjectResolver } from '../IObjectResolver.ts';
import { TypeKey } from '../Token.ts';

export class TypedParameter implements IInjectParameter {
    constructor(
        public readonly type: TypeKey,
        public readonly value: unknown,
    ) {}

    match(parameterType: TypeKey, _parameterName: string): boolean {
        return parameterType === this.type;
    }

    getValue(_resolver: IObjectResolver): unknown {
        return this.value;
    }
}

export class FuncTypedParameter implements IInjectParameter {
    constructor(
        public readonly type: TypeKey,
        public readonly func: (resolver: IObjectResolver) => unknown,
    ) {}

    match(parameterType: TypeKey, _parameterName: string): boolean {
        return parameterType === this.type;
    }

    getValue(resolver: IObjectResolver): unknown {
        return this.func(resolver);
    }
}

export class NamedParameter implements IInjectParameter {
    constructor(
        public readonly name: string,
        public readonly value: unknown,
    ) {}

    match(_parameterType: TypeKey, parameterName: string): boolean {
        return parameterName === this.name;
    }

    getValue(_resolver: IObjectResolver): unknown {
        return this.value;
    }
}

export class FuncNamedParameter implements IInjectParameter {
    constructor(
        public readonly name: string,
        public readonly func: (resolver: IObjectResolver) => unknown,
    ) {}

    match(_parameterType: TypeKey, parameterName: string): boolean {
        return parameterName === this.name;
    }

    getValue(resolver: IObjectResolver): unknown {
        return this.func(resolver);
    }
}
