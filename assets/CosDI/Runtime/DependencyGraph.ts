import { Lifetime } from './Lifetime.ts';
import { Registration } from './Registration.ts';
import { TypeKey, typeKeyName } from './Token.ts';
import { Dependency, DependencyKind, dependenciesOf } from './Internal/Dependencies.ts';
import {
    CollectionInstanceProvider,
    ContainerInstanceProvider,
    ExistingInstanceProvider,
    FuncInstanceProvider,
} from './Internal/InstanceProviders.ts';
import { Registry } from './Internal/Registry.ts';
import type { IObjectResolver, IScopedObjectResolver } from './IObjectResolver.ts';

/** What answers an edge: something here, something above, or nothing. */
export type DependencyStatus = 'local' | 'parent' | 'missing' | 'keyless';

/** What makes the instance, which decides whether the node has edges at all. */
export type DependencySource = 'class' | 'component' | 'instance' | 'factory' | 'container' | 'collection' | 'other';

/** One thing a node asks the container for, and what the container found. */
export interface DependencyEdge {
    readonly kind: DependencyKind;
    /** The parameter or field it lands on. */
    readonly name: string;
    /** How to say where it lands, as in `constructor parameter 'service'`. */
    readonly site: string;
    readonly token: TypeKey | undefined;
    readonly key: object | undefined;
    readonly status: DependencyStatus;
    /**
     * What it lands on. One node usually, several when the edge asks for a
     * collection, none when nothing registers it.
     */
    readonly targets: readonly DependencyNode[];
}

/** One registration, with what it asks for and who asks for it. */
export interface DependencyNode {
    /** Its place in `graph.nodes`, which is how a snapshot names it. */
    readonly id: number;
    readonly registration: Registration;
    readonly type: TypeKey;
    readonly name: string;
    readonly lifetime: Lifetime;
    readonly contracts: readonly TypeKey[];
    readonly key: object | undefined;
    /** Where the registration lives. A parent's is listed but not walked. */
    readonly scope: 'local' | 'parent';
    readonly source: DependencySource;
    readonly edges: readonly DependencyEdge[];
    readonly dependents: readonly DependencyNode[];
}

/** A loop, with the node it starts at repeated at the end. */
export interface DependencyCycle {
    readonly nodes: readonly DependencyNode[];
    /** `edges[i]` is what takes the walk from `nodes[i]` to `nodes[i + 1]`. */
    readonly edges: readonly DependencyEdge[];
}

/**
 * What a container would resolve, read off the registrations before anything
 * is resolved. Validation and the diagnostics panel both read this, and
 * `container.dependencyGraph` hands you the one the container was built with.
 */
export class DependencyGraph {
    readonly nodes: readonly DependencyNode[];
    readonly cycles: readonly DependencyCycle[];

    constructor(nodes: readonly DependencyNode[], cycles: readonly DependencyCycle[]) {
        this.nodes = nodes;
        this.cycles = cycles;
    }

    /** Nodes nothing else asks for: entry points, and where a walk starts. */
    get roots(): readonly DependencyNode[] {
        return this.nodes.filter((node) => node.dependents.length === 0);
    }

    find(type: TypeKey, key?: object): DependencyNode | null {
        for (const node of this.nodes) {
            if (node.key !== key) {
                continue;
            }
            if (node.type === type || node.contracts.indexOf(type) >= 0) {
                return node;
            }
        }
        return null;
    }

    /** Every node the given one reaches, itself left out, each listed once. */
    reachableFrom(node: DependencyNode): DependencyNode[] {
        const seen = new Set<DependencyNode>([node]);
        const found: DependencyNode[] = [];
        const queue: DependencyNode[] = [node];
        while (queue.length > 0) {
            for (const edge of queue.shift()!.edges) {
                for (const target of edge.targets) {
                    if (seen.has(target)) {
                        continue;
                    }
                    seen.add(target);
                    found.push(target);
                    queue.push(target);
                }
            }
        }
        return found;
    }

    toString(): string {
        return dependencyGraphText(this);
    }
}

/**
 * Reads the registrations the way the injector will: a provider that hands
 * over a finished instance asks for nothing, a component asks for its fields
 * alone, and a value given with `withParameter` never reaches the container.
 *
 * Scopes above are searched the way the container searches them, so what only
 * a parent registers reads as `parent` rather than as missing. A scope built
 * later cannot be seen from here.
 */
export function buildDependencyGraph(
    registrations: readonly Registration[],
    registry: Registry,
    parent: IScopedObjectResolver | null = null,
): DependencyGraph {
    const nodes: DependencyNode[] = [];
    const byRegistration = new Map<Registration, DependencyNode>();

    for (const registration of registrations) {
        addNode(registration, 'local');
    }

    for (const node of nodes.slice()) {
        if (node.scope === 'parent') {
            continue;
        }
        for (const dependency of dependenciesOf(node.registration)) {
            (node.edges as DependencyEdge[]).push(edgeFor(node, dependency));
        }
    }

    return new DependencyGraph(nodes, findCycles(nodes));

    function addNode(registration: Registration, scope: 'local' | 'parent'): DependencyNode {
        const existing = byRegistration.get(registration);
        if (existing) {
            return existing;
        }
        const node: DependencyNode = {
            id: nodes.length,
            registration,
            type: registration.implementationType,
            name: typeKeyName(registration.implementationType),
            lifetime: registration.lifetime,
            contracts: registration.interfaceTypes ?? [],
            key: registration.key,
            scope,
            source: sourceOf(registration),
            edges: [],
            dependents: [],
        };
        nodes.push(node);
        byRegistration.set(registration, node);
        return node;
    }

    function edgeFor(owner: DependencyNode, dependency: Dependency): DependencyEdge {
        const edge = {
            kind: dependency.kind,
            name: dependency.name,
            site: dependency.site,
            token: dependency.token,
            key: dependency.key,
            status: 'missing' as DependencyStatus,
            targets: [] as DependencyNode[],
        };
        if (dependency.token == null) {
            edge.status = 'keyless';
            return edge;
        }

        const local = registry.tryGet(dependency.token, dependency.key);
        if (local) {
            edge.status = 'local';
            for (const target of targetsOf(local)) {
                edge.targets.push(link(owner, target, 'local'));
            }
            return edge;
        }

        const above = findAbove(dependency.token, dependency.key);
        if (above) {
            edge.status = 'parent';
            for (const target of targetsOf(above)) {
                edge.targets.push(link(owner, target, 'parent'));
            }
        }
        return edge;
    }

    /** A collection stands for its elements, which is what gets resolved. */
    function targetsOf(registration: Registration): readonly Registration[] {
        const provider = registration.provider;
        return provider instanceof CollectionInstanceProvider ? [...provider] : [registration];
    }

    function link(owner: DependencyNode, registration: Registration, scope: 'local' | 'parent'): DependencyNode {
        const target = addNode(registration, scope);
        if (target.dependents.indexOf(owner) < 0) {
            (target.dependents as DependencyNode[]).push(owner);
        }
        return target;
    }

    function findAbove(token: TypeKey, key: object | undefined): Registration | null {
        let scope = parent;
        while (scope != null) {
            const found = scope.tryGetRegistration(token, key);
            if (found) {
                return found;
            }
            scope = scope.parent;
        }
        return null;
    }
}

/** The graph a container was built with, or one built from a graph you pass. */
export function dependencyGraphOf(source: DependencyGraph | IObjectResolver): DependencyGraph | null {
    if (source instanceof DependencyGraph) {
        return source;
    }
    return source.dependencyGraph ?? null;
}

export interface DependencyGraphTextOptions {
    /** How far to follow each root. Anything deeper is left off. */
    maxDepth?: number;
}

/**
 * Draws the graph as a tree, one root per block. A node already drawn is
 * marked rather than drawn again, so the text stays as long as the graph is.
 */
export function dependencyGraphText(
    source: DependencyGraph | IObjectResolver | null,
    options: DependencyGraphTextOptions = {},
): string {
    const graph = source == null ? null : dependencyGraphOf(source);
    if (!graph || graph.nodes.length === 0) {
        return 'No registrations.';
    }

    const maxDepth = options.maxDepth ?? 32;
    const lines: string[] = [];
    const drawn = new Set<DependencyNode>();

    for (const root of graph.roots) {
        draw(root, '', '', [], 0);
    }
    for (const node of graph.nodes) {
        if (!drawn.has(node)) {
            draw(node, '', '', [], 0);
        }
    }
    if (graph.cycles.length > 0) {
        lines.push('');
        for (const cycle of graph.cycles) {
            lines.push(`Cycle: ${cycleText(cycle)}`);
        }
    }
    return lines.join('\n');

    function draw(
        node: DependencyNode,
        indent: string,
        site: string,
        path: readonly DependencyNode[],
        depth: number,
    ): void {
        const from = site === '' ? '' : `${site} -> `;
        if (path.indexOf(node) >= 0) {
            lines.push(`${indent}${from}${node.name} (cycle)`);
            return;
        }
        const again = drawn.has(node) && node.edges.length > 0;
        lines.push(`${indent}${from}${label(node)}${again ? ' (drawn above)' : ''}`);
        drawn.add(node);
        if (again || depth >= maxDepth) {
            return;
        }

        const children: Array<{ edge: DependencyEdge; target: DependencyNode | null }> = [];
        for (const edge of node.edges) {
            if (edge.targets.length === 0) {
                children.push({ edge, target: null });
                continue;
            }
            for (const target of edge.targets) {
                children.push({ edge, target });
            }
        }

        const below = indent === '' ? '' : indent.slice(0, -3) + (indent.endsWith('└─ ') ? '   ' : '│  ');
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const childIndent = below + (i === children.length - 1 ? '└─ ' : '├─ ');
            if (!child.target) {
                lines.push(`${childIndent}${child.edge.site} -> ${unmet(child.edge)}`);
                continue;
            }
            draw(child.target, childIndent, child.edge.site, [...path, node], depth + 1);
        }
    }

    function label(node: DependencyNode): string {
        const contracts = node.contracts
            .filter((contract) => contract !== node.type)
            .map(typeKeyName)
            .join(', ');
        const parts = [`${Lifetime[node.lifetime]} ${node.source}`];
        if (contracts) {
            parts.push(`as ${contracts}`);
        }
        if (node.key != null) {
            parts.push(`key ${String(node.key)}`);
        }
        if (node.scope === 'parent') {
            parts.push('from a parent scope');
        }
        return `${node.name} [${parts.join(', ')}]`;
    }
}

/**
 * Writes the graph as a Mermaid flowchart, which GitHub and most Markdown
 * viewers draw. Unmet edges are dashed and end in what was asked for.
 */
export function dependencyGraphMermaid(source: DependencyGraph | IObjectResolver | null): string {
    const graph = source == null ? null : dependencyGraphOf(source);
    const lines = ['flowchart LR'];
    if (!graph || graph.nodes.length === 0) {
        return lines.join('\n');
    }

    for (const node of graph.nodes) {
        const shape = node.scope === 'parent' ? ['[(', ')]'] : ['["', '"]'];
        const detail = `${node.name}<br/>${Lifetime[node.lifetime]} ${node.source}`;
        lines.push(`    n${node.id}${shape[0]}${mermaidText(detail)}${shape[1]}`);
    }

    let unmet = 0;
    for (const node of graph.nodes) {
        for (const edge of node.edges) {
            if (edge.targets.length === 0) {
                const id = `u${unmet++}`;
                lines.push(`    ${id}(["${mermaidText(unmetName(edge))}"]):::cosdiUnmet`);
                lines.push(`    n${node.id} -. "${mermaidText(edge.name)}" .-> ${id}`);
                continue;
            }
            for (const target of edge.targets) {
                lines.push(`    n${node.id} -- "${mermaidText(edge.name)}" --> n${target.id}`);
            }
        }
    }
    lines.push('    classDef cosdiUnmet stroke-dasharray: 4 4;');
    return lines.join('\n');
}

/** `A -> B (constructor parameter 'a') -> A (field 'b')`. */
export function cycleText(cycle: DependencyCycle): string {
    return cycle.nodes
        .map((node, index) => (index === 0 ? node.name : `${node.name} (${cycle.edges[index - 1].site})`))
        .join(' -> ');
}

function unmet(edge: DependencyEdge): string {
    return edge.status === 'keyless' ? 'nothing named' : `${unmetName(edge)} (nothing registers it)`;
}

function unmetName(edge: DependencyEdge): string {
    return edge.token == null ? `${edge.name}?` : typeKeyName(edge.token);
}

function mermaidText(value: string): string {
    return value.replace(/"/g, "'");
}

function sourceOf(registration: Registration): DependencySource {
    const provider = registration.provider;
    if (provider instanceof CollectionInstanceProvider) {
        return 'collection';
    }
    if (provider instanceof ContainerInstanceProvider) {
        return 'container';
    }
    if (provider instanceof ExistingInstanceProvider) {
        return 'instance';
    }
    if (provider instanceof FuncInstanceProvider) {
        return 'factory';
    }
    switch (provider.injection ?? 'none') {
        case 'constructor':
            return 'class';
        case 'fields':
            return 'component';
        default:
            return 'other';
    }
}

/**
 * Follows what each node asks for until something asks for a node already
 * being walked. Every node is walked once, so a wide graph costs one pass
 * rather than one per path through it.
 */
function findCycles(nodes: readonly DependencyNode[]): DependencyCycle[] {
    const cycles: DependencyCycle[] = [];
    const walking = new Set<DependencyNode>();
    const settled = new Set<DependencyNode>();
    const reported = new Set<string>();
    const path: Array<{ node: DependencyNode; edge: DependencyEdge | null }> = [];

    for (const node of nodes) {
        walk(node, null);
    }
    return cycles;

    function walk(node: DependencyNode, edge: DependencyEdge | null): void {
        if (settled.has(node)) {
            return;
        }
        if (walking.has(node)) {
            report([...path, { node, edge }]);
            return;
        }

        walking.add(node);
        path.push({ node, edge });
        for (const next of node.edges) {
            for (const target of next.targets) {
                walk(target, next);
            }
        }
        path.pop();
        walking.delete(node);
        settled.add(node);
    }

    function report(steps: ReadonlyArray<{ node: DependencyNode; edge: DependencyEdge | null }>): void {
        const closing = steps[steps.length - 1];
        const loop = steps.slice(steps.findIndex((step) => step.node === closing.node));

        const identity = loop.slice(1).map((step) => step.node.id).sort().join(',');
        if (reported.has(identity)) {
            return;
        }
        reported.add(identity);

        cycles.push({
            nodes: loop.map((step) => step.node),
            edges: loop.slice(1).map((step) => step.edge as DependencyEdge),
        });
    }
}
