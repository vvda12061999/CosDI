import { TypeKey, typeKeyName } from './Token.ts';

export class CosDIException extends Error {
    public readonly invalidType: TypeKey | null;

    constructor(invalidType: TypeKey | null, message: string) {
        super(message);
        this.name = 'CosDIException';
        this.invalidType = invalidType;
        Object.setPrototypeOf(this, new.target.prototype);
    }

    static typeName(type: TypeKey | null): string {
        return typeKeyName(type);
    }
}

export class CosDIParentTypeReferenceNotFound extends CosDIException {
    constructor(parentType: TypeKey, message: string) {
        super(parentType, message);
        this.name = 'CosDIParentTypeReferenceNotFound';
    }
}
