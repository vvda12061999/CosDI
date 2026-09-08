import { TypeKey, typeKeyName } from './Token.ts';
import type { ValidationProblem } from './Internal/Validation.ts';

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

/** Everything wrong with the registrations, reported by `build()` at once. */
export class CosDIValidationException extends CosDIException {
    readonly problems: readonly ValidationProblem[];

    constructor(problems: readonly ValidationProblem[]) {
        super(problems[0]?.type ?? null, describe(problems));
        this.name = 'CosDIValidationException';
        // Hidden from the console, which would otherwise print every
        // registration underneath a message that already says it all.
        Object.defineProperty(this, 'problems', { value: problems, enumerable: false });
    }
}

function describe(problems: readonly ValidationProblem[]): string {
    const lines = problems.map((problem, index) => `  ${index + 1}. ${problem.message}`);
    return [
        `Container validation found ${problems.length} problem${problems.length === 1 ? '' : 's'}:`,
        ...lines,
        '  Set builder.validateOnBuild = false to build anyway, as a dependency that only a child scope registers needs.',
    ].join('\n');
}
