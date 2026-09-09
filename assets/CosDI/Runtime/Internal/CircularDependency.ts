import { DependencyGraph, buildDependencyGraph, cycleText } from '../DependencyGraph.ts';
import { Registration } from '../Registration.ts';
import { Registry } from './Registry.ts';
import type { ValidationProblem } from './Validation.ts';

/**
 * Reports every loop the container would fall into rather than resolve.
 *
 * The graph is what decides: a registration the container does not construct
 * has no edges, so a factory or a registered instance breaks a loop here
 * exactly as it breaks one at runtime.
 */
export function findCircularDependencies(
    registrations: readonly Registration[],
    registry: Registry,
): ValidationProblem[] {
    return cycleProblems(buildDependencyGraph(registrations, registry));
}

/** The same, off a graph that has already been built. */
export function cycleProblems(graph: DependencyGraph): ValidationProblem[] {
    return graph.cycles.map((cycle) => {
        const closing = cycle.nodes[cycle.nodes.length - 1];
        return {
            kind: 'cycle' as const,
            registration: closing.registration,
            type: closing.type,
            cycle: cycle.nodes.map((node) => node.registration),
            message: `Circular dependency detected: ${cycleText(cycle)}. `
                + 'Break it by taking IObjectResolver and resolving one side when it is needed, '
                + 'or by handing one side over with registerFactory.',
        };
    });
}
