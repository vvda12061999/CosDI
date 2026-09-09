import { DependencyGraph, DependencyEdge, DependencyNode, buildDependencyGraph } from '../DependencyGraph.ts';
import { IScopedObjectResolver } from '../IObjectResolver.ts';
import { Registration } from '../Registration.ts';
import { TypeKey, typeKeyName } from '../Token.ts';
import { cycleProblems } from './CircularDependency.ts';
import { Registry } from './Registry.ts';

export type ValidationProblemKind = 'cycle' | 'missing' | 'keyless' | 'unconstructible';

/** One thing wrong with a registration, found before anything is resolved. */
export interface ValidationProblem {
    readonly kind: ValidationProblemKind;
    readonly registration: Registration;
    readonly type: TypeKey | null;
    readonly message: string;
    /** For a cycle: what it runs through, with the start repeated at the end. */
    readonly cycle?: readonly Registration[];
}

/**
 * Reads every registration the way the container will, and reports what would
 * fail: a loop, a dependency nothing registers, a parameter or field with no
 * key to look up, a key registered as if it were a class.
 *
 * A dependency is looked for here and in the scopes above, which is where the
 * container looks. It cannot see a scope built later, so a service that only
 * arrives in a child scope reads as missing.
 */
export function validateRegistrations(
    registrations: readonly Registration[],
    registry: Registry,
    parent: IScopedObjectResolver | null = null,
): ValidationProblem[] {
    return validateGraph(buildDependencyGraph(registrations, registry, parent));
}

/** The same, off a graph that has already been built. */
export function validateGraph(graph: DependencyGraph): ValidationProblem[] {
    const problems: ValidationProblem[] = cycleProblems(graph);
    for (const node of graph.nodes) {
        if (node.scope === 'local') {
            validateNode(node, problems);
        }
    }
    return problems;
}

function validateNode(node: DependencyNode, problems: ValidationProblem[]): void {
    const registration = node.registration;
    if ((registration.provider.injection ?? 'none') === 'none') {
        return;
    }

    if (typeof node.type !== 'function') {
        problems.push({
            kind: 'unconstructible',
            registration,
            type: node.type,
            message: `${node.name} is registered as something to construct, but it is a key, not a class. `
                + `Register the class and name it with .as(${node.name}), `
                + 'or hand over an instance with registerInstance / registerFactory.',
        });
        return;
    }

    for (const edge of node.edges) {
        if (edge.status === 'keyless') {
            problems.push({
                kind: 'keyless',
                registration,
                type: node.type,
                message: `${node.name} has no key for ${edge.site}: nothing registered goes by that name. `
                    + hint(edge),
            });
            continue;
        }
        if (edge.status !== 'missing') {
            continue;
        }
        problems.push({
            kind: 'missing',
            registration,
            type: edge.token ?? null,
            message: `${node.name} asks for ${typeKeyName(edge.token as TypeKey)} (${edge.site}), which nothing registers`
                + `${edge.key == null ? '' : ` with Key: ${String(edge.key)}`}.`,
        });
    }
}

function hint(edge: DependencyEdge): string {
    if (edge.kind === 'field') {
        return `Name the key, as in @inject(${pascal(edge.name)}).`;
    }
    if (edge.kind === 'parameter') {
        return `Pass it to @injectable(...) in constructor order, or give it a value with .withParameter('${edge.name}', ...).`;
    }
    return 'Name the key on the parameter.';
}

function pascal(name: string): string {
    const bare = name.replace(/^_+/, '');
    return bare.charAt(0).toUpperCase() + bare.slice(1);
}
