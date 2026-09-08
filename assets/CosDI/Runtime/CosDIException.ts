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

/** One hop of the walk that failed: what was being built, and where it asked. */
export interface ResolutionStep {
    readonly type: TypeKey;
    readonly site: string;
}

/**
 * How much of the walk is kept. A loop resolved with validation off overflows
 * the stack thousands of frames down, and the deepest few say everything the
 * thousand above them would.
 */
const KEPT_STEPS = 12;

/** Adds a step, oldest first, and says how many were dropped along the way. */
function keepStep(path: ResolutionStep[], step: ResolutionStep, dropped: number): number {
    if (path.length < KEPT_STEPS) {
        path.unshift(step);
        return dropped;
    }
    return dropped + 1;
}

/** Names the type that comes round twice, which is what a loop looks like. */
function loopNote(path: readonly ResolutionStep[]): string {
    for (let i = 0; i < path.length; i++) {
        for (let j = i + 1; j < path.length; j++) {
            if (path[i].type === path[j].type) {
                return `\n\n  ${typeKeyName(path[i].type)} comes round twice, so this is a circular dependency. `
                    + 'Leave builder.validateOnBuild on and build() names it before anything is resolved.';
            }
        }
    }
    return '';
}

/**
 * Draws the walk that led to a failure, outermost first. The last line is
 * whatever went wrong, so the reader gets there by following what asked.
 */
export function resolutionTree(path: readonly ResolutionStep[], leaf: string, dropped = 0, indent = '  '): string {
    if (path.length === 0) {
        return '';
    }
    const lines = dropped > 0 ? [`${indent}... ${dropped} more above`] : [];
    lines.push(indent + typeKeyName(path[0].type));
    for (let index = 0; index < path.length; index++) {
        const next = index + 1 < path.length ? typeKeyName(path[index + 1].type) : '';
        const target = next ? ` -> ${next}` : (leaf ? ` -> ${leaf}` : '');
        lines.push(indent + '  '.repeat(index + 1) + path[index].site + target);
    }
    return lines.join('\n');
}

/** A key the container was asked for and could not answer. */
export class CosDIResolutionException extends CosDIException {
    readonly path: ResolutionStep[] = [];
    /** The key that is missing, which is not always the one that was asked for. */
    readonly missingType: TypeKey;
    readonly missingKey: object | undefined;
    private dropped = 0;

    constructor(
        type: TypeKey,
        key: object | undefined,
        private readonly headline: string,
        /** What is known about the key: near names, scopes searched, what to do. */
        private readonly detail: string,
    ) {
        super(type, headline);
        this.name = 'CosDIResolutionException';
        this.missingType = type;
        this.missingKey = key;
        Object.defineProperty(this, 'path', { value: [], enumerable: false });
        // The walk is only complete once the failure has passed back out
        // through everything that asked, so the message is written on reading.
        tellOnRead(this, () => this.describe());
    }

    /** Called as the failure passes back out through whatever asked for it. */
    addStep(step: ResolutionStep): void {
        this.dropped = keepStep(this.path, step, this.dropped);
    }

    private describe(): string {
        const marker = `${typeKeyName(this.missingType)} (nothing registers it)`;
        const tree = resolutionTree(this.path, marker, this.dropped);
        return tree
            ? `${this.headline}\n\n${tree}\n\n  ${this.detail}${loopNote(this.path)}`
            : `${this.headline} ${this.detail}`;
    }
}

const TRACE = '__cosdiTrace';

interface Traced extends Error {
    [TRACE]?: { steps: ResolutionStep[]; stack: string; dropped: number };
}

/**
 * Records where a failure came from. A resolution failure grows its own tree;
 * anything else - a constructor that threw, a factory that gave up - keeps its
 * type and message, and gets the walk appended to its stack, which is what a
 * console prints.
 */
export function traceResolution(error: unknown, type: TypeKey, site: string): void {
    if (error instanceof CosDIResolutionException) {
        error.addStep({ type, site });
        return;
    }
    if (!(error instanceof Error)) {
        return;
    }

    const traced = error as Traced;
    let trace = traced[TRACE];
    if (!trace) {
        trace = { steps: [], stack: error.stack || `${error.name}: ${error.message}`, dropped: 0 };
        Object.defineProperty(error, TRACE, { value: trace, enumerable: false, writable: true });
        Object.defineProperty(error, 'stack', {
            configurable: true,
            get: () => `${trace!.stack}\n\nCosDI was resolving:\n`
                + `${resolutionTree(trace!.steps, '', trace!.dropped)} <- threw here`
                + loopNote(trace!.steps),
            set: (value: string) => { trace!.stack = value; },
        });
    }
    trace.dropped = keepStep(trace.steps, { type, site }, trace.dropped);
}

/**
 * Puts off writing the message until something reads it. V8 wrote the first
 * line of `stack` from the message it had at the time, so both are answered
 * from the same text.
 */
function tellOnRead(error: Error, describe: () => string): void {
    const stack = error.stack || '';
    const head = `${error.name}: ${error.message}`;
    const tail = stack.startsWith(head) ? stack.slice(head.length) : `\n${stack}`;
    Object.defineProperty(error, 'message', { configurable: true, get: describe, set: overwrite('message') });
    Object.defineProperty(error, 'stack', {
        configurable: true,
        get: () => `${error.name}: ${describe()}${tail}`,
        set: overwrite('stack'),
    });

    /** Anything that writes over one of these gets a plain property back. */
    function overwrite(property: 'message' | 'stack') {
        return (value: string) => {
            Object.defineProperty(error, property, { value, writable: true, configurable: true });
        };
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
