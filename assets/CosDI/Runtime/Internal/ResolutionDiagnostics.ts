import { CosDIResolutionException } from '../CosDIException.ts';
import { TypeKey, typeKeyName } from '../Token.ts';
import type { DependencyGraph, DependencyNode } from '../DependencyGraph.ts';
import type { IObjectResolver, IScopedObjectResolver } from '../IObjectResolver.ts';

/** How far apart two names can be before one stops being a likely typo. */
const NEAR = 3;
const SUGGESTIONS = 3;

/**
 * Builds the failure for a key nothing answers. The container knows more than
 * the name that was asked for: how far it looked, what is registered under a
 * near name, and whether the key is there under a key of its own.
 */
export function missingRegistration(
    resolver: IObjectResolver,
    type: TypeKey,
    key: object | undefined,
): CosDIResolutionException {
    const asked = typeKeyName(type);
    const graph = resolver.dependencyGraph ?? null;
    const detail: string[] = [scopesSearched(resolver)];

    const literal = typeof type === 'string' ? `'${asked}'` : asked;
    const elsewhere = graph ? sameTypeElsewhere(graph, type, key) : [];
    const near = elsewhere.length > 0 ? [] : (graph ? nearNames(graph, asked) : []);

    if (elsewhere.length > 0) {
        detail.push(keyedHint(asked, key, elsewhere));
    } else if (near.length > 0) {
        detail.push(near.length === 1
            ? `Did you mean ${near[0]}?`
            : `Did you mean one of ${near.join(', ')}?`);
        detail.push(`If not, register it with builder.register(...).as(${literal}).`);
    } else {
        detail.push(`Register it with builder.register(...).as(${literal})`
            + ', or ask with tryResolve when it is allowed to be missing.');
    }

    return new CosDIResolutionException(
        type,
        key,
        `Nothing registers ${asked}${key == null ? '' : ` with key ${describeKey(key)}`}.`,
        detail.join(' '),
    );
}

function scopesSearched(resolver: IObjectResolver): string {
    let above = 0;
    let scope = (resolver as IScopedObjectResolver).parent;
    while (scope) {
        above++;
        scope = scope.parent;
    }
    if (above === 0) {
        return 'Looked in this container.';
    }
    return `Looked in this scope and the ${above} scope${above === 1 ? '' : 's'} above it.`;
}

/** The same type, registered under a key other than the one asked for. */
function sameTypeElsewhere(graph: DependencyGraph, type: TypeKey, key: object | undefined): DependencyNode[] {
    const found: DependencyNode[] = [];
    for (const node of graph.nodes) {
        if (node.key === key) {
            continue;
        }
        if (node.type === type || node.contracts.indexOf(type) >= 0) {
            found.push(node);
        }
    }
    return found;
}

function keyedHint(asked: string, key: object | undefined, elsewhere: readonly DependencyNode[]): string {
    const keys = elsewhere.map((node) => describeKey(node.key));
    if (key == null) {
        return `${asked} is registered, but only with ${keys.length === 1 ? 'key' : 'keys'} ${keys.join(', ')}. `
            + `Ask for it the same way: resolve(${asked}, ${keys[0]}), or @inject(${asked}) @key(${keys[0]}).`;
    }
    if (elsewhere.some((node) => node.key === undefined)) {
        return `${asked} is registered without a key. Drop the key, or register it with .keyed(${describeKey(key)}).`;
    }
    return `${asked} is registered with ${keys.length === 1 ? 'key' : 'keys'} ${keys.join(', ')}, not ${describeKey(key)}.`;
}

function describeKey(key: object | undefined): string {
    if (key === undefined) {
        return 'no key';
    }
    return typeof key === 'string' ? `'${key}'` : String(key);
}

/** Registered names close enough to what was asked for to be the same thing. */
function nearNames(graph: DependencyGraph, asked: string): string[] {
    const seen = new Set<string>();
    const scored: { name: string; distance: number }[] = [];

    for (const node of graph.nodes) {
        consider(node.name);
        for (const contract of node.contracts) {
            consider(typeKeyName(contract));
        }
    }

    scored.sort((a, b) => (a.distance === b.distance ? (a.name < b.name ? -1 : 1) : a.distance - b.distance));
    return scored.slice(0, SUGGESTIONS).map((entry) => entry.name);

    function consider(name: string): void {
        if (!name || name === asked || seen.has(name)) {
            return;
        }
        seen.add(name);
        const distance = editDistance(asked.toLowerCase(), name.toLowerCase());
        // A long name can be further out and still be the one that was meant.
        if (distance <= Math.min(NEAR, Math.max(1, Math.floor(asked.length / 3)))) {
            scored.push({ name, distance });
        }
    }
}

/** Levenshtein, over one row, giving up once nothing on the row is near. */
function editDistance(left: string, right: string): number {
    if (left === right) {
        return 0;
    }
    if (Math.abs(left.length - right.length) > NEAR) {
        return NEAR + 1;
    }

    let row = new Array<number>(right.length + 1);
    for (let index = 0; index <= right.length; index++) {
        row[index] = index;
    }

    for (let i = 1; i <= left.length; i++) {
        const next = new Array<number>(right.length + 1);
        next[0] = i;
        let best = i;
        for (let j = 1; j <= right.length; j++) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + cost);
            best = Math.min(best, next[j]);
        }
        if (best > NEAR) {
            return NEAR + 1;
        }
        row = next;
    }
    return row[right.length];
}
