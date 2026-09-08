import { Registration } from '../Registration.ts';
import { typeKeyName } from '../Token.ts';
import { dependenciesOf } from './Dependencies.ts';
import { CollectionInstanceProvider } from './InstanceProviders.ts';
import { Registry } from './Registry.ts';
import type { ValidationProblem } from './Validation.ts';

interface Step {
    readonly registration: Registration;
    /** Where the step before it asked for this one. Null for the walk's root. */
    readonly site: string | null;
}

/**
 * Follows what each registration asks for until something asks for a
 * registration already being built, which is a loop the container would fall
 * into rather than resolve.
 *
 * Every registration is walked once. A registration the container does not
 * construct ends the walk, so a factory or a registered instance breaks a loop
 * here exactly as it breaks one at runtime.
 */
export function findCircularDependencies(
    registrations: readonly Registration[],
    registry: Registry,
): ValidationProblem[] {
    const problems: ValidationProblem[] = [];
    const walking = new Set<Registration>();
    const settled = new Set<Registration>();
    const reported = new Set<string>();
    const path: Step[] = [];

    for (const registration of registrations) {
        walk(registration, null);
    }
    return problems;

    function walk(registration: Registration, site: string | null): void {
        if (settled.has(registration)) {
            return;
        }
        if (walking.has(registration)) {
            report([...path, { registration, site }]);
            return;
        }

        walking.add(registration);
        path.push({ registration, site });

        for (const dependency of dependenciesOf(registration)) {
            if (dependency.token == null) {
                continue;
            }
            const target = registry.tryGet(dependency.token, dependency.key);
            if (!target) {
                continue;
            }
            if (target.provider instanceof CollectionInstanceProvider) {
                for (const element of target.provider) {
                    walk(element, dependency.site);
                }
                continue;
            }
            walk(target, dependency.site);
        }

        path.pop();
        walking.delete(registration);
        settled.add(registration);
    }

    function report(steps: readonly Step[]): void {
        const closing = steps[steps.length - 1];
        const start = steps.findIndex((step) => step.registration === closing.registration);
        const loop = steps.slice(start);

        const identity = loop.slice(1).map((step) => registrations.indexOf(step.registration)).sort().join(',');
        if (reported.has(identity)) {
            return;
        }
        reported.add(identity);

        const chain = loop
            .map((step, index) => {
                const name = typeKeyName(step.registration.implementationType);
                return index === 0 ? name : `${name} (${step.site})`;
            })
            .join(' -> ');

        problems.push({
            kind: 'cycle',
            registration: closing.registration,
            type: closing.registration.implementationType,
            cycle: loop.map((step) => step.registration),
            message: `Circular dependency detected: ${chain}. `
                + 'Break it by taking IObjectResolver and resolving one side when it is needed, '
                + 'or by handing one side over with registerFactory.',
        });
    }
}
