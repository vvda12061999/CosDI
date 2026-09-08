'use strict';

/**
 * Reads the DI in a project's sources and reports what would fail, before the
 * game runs. `build()` finds the same mistakes, but only once play reaches the
 * scene that builds the container; this finds them at build time, or on save.
 *
 * It reads decorators and registration calls, which say plainly what they are.
 * Anything worked out at run time - a key held in a variable, a scope a
 * package installs - cannot be read here, so a key nothing in the project
 * registers is reported and everything else is left alone.
 */

const fs = require('fs');
const path = require('path');
const { maskCode, collectFiles } = require('./token-codegen.js');

const RULES = [
    'missing-registration',
    'no-key',
    'key-as-class',
    'component-injectable',
    'parameter-decorator',
    'circular-dependency',
];

const DEFAULT_RULES = {
    'missing-registration': 'error',
    'no-key': 'error',
    'key-as-class': 'error',
    'component-injectable': 'error',
    'parameter-decorator': 'error',
    'circular-dependency': 'error',
};

/** Keys the container answers on its own, with no registration in sight. */
const BUILT_IN_KEYS = [
    'IObjectResolver',
    'ObjectResolverToken',
    'LifetimeScope',
    'EntryPointDispatcher',
    'EntryPointExceptionHandler',
    'IInitializable',
    'IPostInitializable',
    'IStartable',
    'IPostStartable',
    'ITickable',
    'IPostTickable',
    'ILateTickable',
    'IAsyncStartable',
];

/** Bases whose instances Cocos constructs, so `@injectable` cannot wrap them. */
const ENGINE_BASES = ['Component', 'LifetimeScope'];

const IGNORE_COMMENT = /cosdi-ignore\b/;
const CLASS = /\bclass\s+([A-Za-z_$][\w$]*)/g;
const CREATE_TOKEN = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createToken\b/g;
const TAGGED_INTERFACE = /@(?:generateToken|createToken)\b[ \t]*(?:\([ \t]*['"]([^'"]+)['"][ \t]*\))?/;
const INTERFACE = /\binterface\s+([A-Za-z_$][\w$]*)/;
const INJECT_SITE = /@(inject|key)\b/g;
const MODIFIER = /^(?:public|private|protected|readonly|static|declare|override|abstract|accessor)\b/;

/** Calls that register something, and which argument carries the key. */
const REGISTER_CALLS = {
    register: 0,
    registerInstance: 0,
    registerFactory: 0,
    registerEntryPoint: 1,
    registerComponentInHierarchy: 1,
    registerComponentOnNewNode: 1,
    registerComponentInNewPrefab: 1,
    add: 0,
};

function lineStarts(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') {
            starts.push(i + 1);
        }
    }
    return starts;
}

function positionOf(starts, index) {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (starts[middle] <= index) {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    return { line: low + 1, column: index - starts[low] + 1 };
}

function matchParen(masked, open) {
    let depth = 0;
    for (let i = open; i < masked.length; i++) {
        const char = masked[i];
        if (char === '(' || char === '[' || char === '{') {
            depth++;
        } else if (char === ')' || char === ']' || char === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}

function matchParenBack(masked, close) {
    let depth = 0;
    for (let i = close; i >= 0; i--) {
        const char = masked[i];
        if (char === ')' || char === ']' || char === '}') {
            depth++;
        } else if (char === '(' || char === '[' || char === '{') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}

/** Splits `(a, b)` at the commas that are not inside anything else. */
function splitArgs(masked, text, from, to) {
    const args = [];
    let start = from;
    let depth = 0;
    for (let i = from; i < to; i++) {
        const char = masked[i];
        if (char === '(' || char === '[' || char === '{') {
            depth++;
        } else if (char === ')' || char === ']' || char === '}') {
            depth--;
        } else if (char === ',' && depth === 0) {
            args.push({ raw: text.slice(start, i), index: start });
            start = i + 1;
        }
    }
    if (text.slice(start, to).trim()) {
        args.push({ raw: text.slice(start, to), index: start });
    }
    return args;
}

/** The name an argument stands for, or null when it is worked out at run time. */
function keyOf(arg) {
    if (!arg) {
        return null;
    }
    const raw = arg.raw.trim();
    const literal = /^(['"])(.*)\1$/.exec(raw);
    if (literal) {
        return { name: literal[2], literal: true };
    }
    const identifier = /^([A-Za-z_$][\w$]*)$/.exec(raw);
    if (identifier) {
        return { name: identifier[1], literal: false };
    }
    const created = /^new\s+([A-Za-z_$][\w$]*)\b/.exec(raw);
    if (created) {
        return { name: created[1], literal: false };
    }
    return null;
}

/** Reads `.as(X).withParameter('y', 1)` and the rest of a registration chain. */
function readChain(masked, text, afterClose) {
    const calls = [];
    let index = afterClose + 1;
    for (;;) {
        while (index < masked.length && /\s/.test(masked[index])) {
            index++;
        }
        const call = /^\.\s*([A-Za-z_$][\w$]*)\s*\(/.exec(masked.slice(index, index + 96));
        if (!call) {
            return calls;
        }
        const open = index + call[0].length - 1;
        const close = matchParen(masked, open);
        if (close < 0) {
            return calls;
        }
        calls.push({ name: call[1], args: splitArgs(masked, text, open + 1, close) });
        index = close + 1;
    }
}

/** The decorators written above whatever starts at `at`. */
function decoratorsBefore(masked, text, at) {
    const decorators = [];
    let cursor = at;
    for (;;) {
        let end = cursor - 1;
        while (end >= 0 && /\s/.test(masked[end])) {
            end--;
        }
        if (end < 0) {
            return decorators;
        }

        const keyword = /(export|default|abstract|declare)$/.exec(masked.slice(0, end + 1));
        if (keyword && keyword.index + keyword[1].length === end + 1) {
            cursor = keyword.index;
            continue;
        }

        if (masked[end] === ')') {
            const open = matchParenBack(masked, end);
            if (open < 0) {
                return decorators;
            }
            const name = /@([A-Za-z_$][\w$]*)\s*$/.exec(masked.slice(0, open));
            if (!name) {
                return decorators;
            }
            const start = open - name[0].length;
            decorators.unshift({
                name: name[1],
                index: start,
                args: splitArgs(masked, text, open + 1, end),
            });
            cursor = start;
            continue;
        }

        const bare = /@([A-Za-z_$][\w$]*)\s*$/.exec(masked.slice(0, end + 1));
        if (bare) {
            const start = end + 1 - bare[0].length;
            decorators.unshift({ name: bare[1], index: start, args: null });
            cursor = start;
            continue;
        }
        return decorators;
    }
}

/** The name a decorator sits on, skipping any decorators and modifiers after it. */
function memberAfter(masked, from) {
    let index = from;
    for (;;) {
        while (index < masked.length && /\s/.test(masked[index])) {
            index++;
        }
        if (masked[index] === '@') {
            const call = /^@[A-Za-z_$][\w$]*\s*/.exec(masked.slice(index));
            if (!call) {
                return null;
            }
            index += call[0].length;
            if (masked[index] === '(') {
                const close = matchParen(masked, index);
                if (close < 0) {
                    return null;
                }
                index = close + 1;
            }
            continue;
        }
        const modifier = MODIFIER.exec(masked.slice(index));
        if (modifier) {
            index += modifier[0].length;
            continue;
        }
        const name = /^([A-Za-z_$][\w$]*)/.exec(masked.slice(index));
        return name ? name[1] : null;
    }
}

function parameterNames(masked, text, open, close) {
    return splitArgs(masked, text, open + 1, close).map((arg) => {
        let raw = arg.raw.replace(/@[A-Za-z_$][\w$]*\s*(\([^)]*\))?/g, '').trim();
        for (;;) {
            const modifier = /^(?:public|private|protected|readonly|override)\s+/.exec(raw);
            if (!modifier) {
                break;
            }
            raw = raw.slice(modifier[0].length).trim();
        }
        const name = /^\.{0,3}\s*([A-Za-z_$][\w$]*)/.exec(raw);
        return name ? name[1] : '';
    });
}

/** Everything one file says about DI, read off its text. */
function parseFile(file, text) {
    const { masked, comments } = maskCode(text);
    const starts = lineStarts(text);
    const parsed = {
        file,
        starts,
        ignored: new Set(),
        tokens: [],
        classes: [],
        registrations: [],
        problems: [],
    };

    for (const comment of comments) {
        if (IGNORE_COMMENT.test(comment.text)) {
            const at = positionOf(starts, comment.start).line;
            parsed.ignored.add(at);
            parsed.ignored.add(at + 1);
        }
        const tagged = TAGGED_INTERFACE.exec(comment.text);
        if (tagged) {
            const declaration = INTERFACE.exec(masked.slice(comment.end, comment.end + 240));
            if (declaration) {
                parsed.tokens.push(tagged[1] || declaration[1]);
            }
        }
    }

    CREATE_TOKEN.lastIndex = 0;
    let token = CREATE_TOKEN.exec(masked);
    while (token) {
        parsed.tokens.push(token[1]);
        token = CREATE_TOKEN.exec(masked);
    }

    readClasses(parsed, masked, text);
    readRegistrations(parsed, masked, text);
    return parsed;
}

function readClasses(parsed, masked, text) {
    CLASS.lastIndex = 0;
    let found = CLASS.exec(masked);
    while (found) {
        const open = masked.indexOf('{', found.index + found[0].length);
        const close = open < 0 ? -1 : matchParen(masked, open);
        if (close < 0) {
            found = CLASS.exec(masked);
            continue;
        }

        const head = masked.slice(found.index, open);
        const base = /\bextends\s+([A-Za-z_$][\w$]*)/.exec(head);
        const type = {
            name: found[1],
            base: base ? base[1] : '',
            index: found.index,
            decorators: decoratorsBefore(masked, text, found.index),
            fields: [],
            constructorParams: [],
        };

        readMembers(parsed, type, masked, text, open, close);
        parsed.classes.push(type);
        CLASS.lastIndex = close;
        found = CLASS.exec(masked);
    }
}

function readMembers(parsed, type, masked, text, open, close) {
    const body = masked.slice(open, close);
    const constructor = /\bconstructor\s*\(/.exec(body);
    let paramsFrom = -1;
    let paramsTo = -1;
    if (constructor) {
        paramsFrom = open + constructor.index + constructor[0].length - 1;
        paramsTo = matchParen(masked, paramsFrom);
        if (paramsTo > 0) {
            type.constructorParams = parameterNames(masked, text, paramsFrom, paramsTo);
        }
    }

    const byName = new Map();
    INJECT_SITE.lastIndex = 0;
    let site = INJECT_SITE.exec(body);
    while (site) {
        const at = open + site.index;
        if (paramsFrom >= 0 && at > paramsFrom && at < paramsTo) {
            type.decoratedParameter = true;
            parsed.problems.push({
                rule: 'parameter-decorator',
                index: at,
                message: `@${site[1]} on a constructor parameter of ${type.name}: Creator can leave the @ in the `
                    + 'emitted JavaScript. Pass the keys to @injectable(...) in constructor order instead.',
            });
            site = INJECT_SITE.exec(body);
            continue;
        }

        let after = at + site[0].length;
        let args = null;
        const rest = masked.slice(after);
        const call = /^\s*\(/.exec(rest);
        if (call) {
            const parenOpen = after + call[0].length - 1;
            const parenClose = matchParen(masked, parenOpen);
            if (parenClose > 0) {
                args = splitArgs(masked, text, parenOpen + 1, parenClose);
                after = parenClose + 1;
            }
        }

        const member = memberAfter(masked, after);
        if (member) {
            let field = byName.get(member);
            if (!field) {
                field = { name: member, index: at, key: null, keyed: false, bare: true };
                byName.set(member, field);
                type.fields.push(field);
            }
            if (site[1] === 'key') {
                field.keyed = true;
            } else {
                field.bare = !args || args.length === 0;
                field.key = field.bare ? null : keyOf(args[0]);
                field.index = at;
            }
        }
        site = INJECT_SITE.exec(body);
    }
}

function readRegistrations(parsed, masked, text) {
    const call = /\b(register|registerInstance|registerFactory|registerEntryPoint|registerComponentInHierarchy|registerComponentOnNewNode|registerComponentInNewPrefab|add)\s*\(/g;
    let found = call.exec(masked);
    while (found) {
        const open = found.index + found[0].length - 1;
        const close = matchParen(masked, open);
        if (close < 0) {
            found = call.exec(masked);
            continue;
        }

        const args = splitArgs(masked, text, open + 1, close);
        const key = keyOf(args[REGISTER_CALLS[found[1]]]);
        if (key) {
            const chain = readChain(masked, text, close);
            const contracts = [];
            const parameters = [];
            let constructs = found[1] !== 'registerFactory' && found[1] !== 'registerInstance';
            for (const link of chain) {
                if (link.name === 'as' || link.name === 'asSelf') {
                    for (const arg of link.args) {
                        const contract = keyOf(arg);
                        if (contract) {
                            contracts.push(contract.name);
                        }
                    }
                } else if (link.name === 'asImplementedInterfaces') {
                    contracts.push(key.name);
                } else if (link.name === 'withParameter') {
                    const parameter = keyOf(link.args[0]);
                    if (parameter) {
                        parameters.push(parameter.name);
                    }
                } else if (link.name === 'keyed') {
                    constructs = constructs && true;
                }
            }
            parsed.registrations.push({
                call: found[1],
                key: key.name,
                literal: key.literal,
                index: found.index,
                contracts,
                parameters,
                constructs,
            });
        }
        call.lastIndex = close;
        found = call.exec(masked);
    }
}

/** Reads the whole project into one model, the way one container would see it. */
function buildModel(parsedFiles) {
    const model = {
        files: parsedFiles,
        registered: new Set(BUILT_IN_KEYS),
        declared: new Set(),
        tokens: new Set(),
        classes: new Map(),
        provider: new Map(),
        registrations: [],
    };

    for (const parsed of parsedFiles) {
        for (const token of parsed.tokens) {
            model.tokens.add(token);
            model.declared.add(token);
        }
        for (const type of parsed.classes) {
            model.declared.add(type.name);
            if (!model.classes.has(type.name)) {
                model.classes.set(type.name, Object.assign({ file: parsed.file }, type));
            }
        }
    }

    for (const parsed of parsedFiles) {
        for (const registration of parsed.registrations) {
            // `.add(X)` is only a registration when X is a class this project has.
            if (registration.call === 'add' && !model.classes.has(registration.key)) {
                continue;
            }
            model.registrations.push(Object.assign({ file: parsed.file, starts: parsed.starts }, registration));
            model.registered.add(registration.key);
            for (const contract of registration.contracts) {
                model.registered.add(contract);
                if (registration.constructs && !model.provider.has(contract)) {
                    model.provider.set(contract, registration.key);
                }
            }
            if (registration.constructs && !model.provider.has(registration.key)) {
                model.provider.set(registration.key, registration.key);
            }
        }
    }

    return model;
}

/** What a name would resolve to at run time, the way `inferTypeKey` reads it. */
function inferredKey(name, model) {
    const bare = name.replace(/^_+/, '').replace(/[$_]+$/, '');
    if (!bare) {
        return null;
    }
    const pascal = bare.charAt(0).toUpperCase() + bare.slice(1);
    const candidates = [bare, pascal, 'I' + pascal];
    for (const candidate of candidates) {
        if (model.registered.has(candidate)) {
            return { name: candidate, registered: true };
        }
    }
    for (const candidate of candidates) {
        if (model.declared.has(candidate)) {
            return { name: candidate, registered: false };
        }
    }
    return null;
}

function isEngineType(type, model) {
    let base = type.base;
    for (let depth = 0; base && depth < 8; depth++) {
        if (ENGINE_BASES.indexOf(base) >= 0) {
            return true;
        }
        const parent = model.classes.get(base);
        base = parent ? parent.base : '';
    }
    return false;
}

/** Everything a class asks the container for, with where it asks. */
function dependenciesOf(type, model) {
    const dependencies = [];
    const injectable = type.decorators.filter((decorator) => decorator.name === 'injectable')[0];
    const supplied = suppliedParameters(type.name, model);

    // A decorated parameter is reported on its own; what it asks for cannot be
    // read until the decorator is gone, so saying so twice helps nobody.
    if (injectable && !type.decoratedParameter) {
        const keys = (injectable.args || []).map(keyOf);
        const count = Math.max(keys.length, type.constructorParams.length);
        for (let index = 0; index < count; index++) {
            const name = type.constructorParams[index] || `arg${index}`;
            if (supplied.has(name)) {
                continue;
            }
            const key = keys[index];
            dependencies.push({
                site: `constructor parameter '${name}'`,
                name,
                key: key || null,
                index: (key && key.name ? injectable.index : type.index),
                inferred: !key,
            });
        }
    }

    for (const field of type.fields) {
        if (supplied.has(field.name)) {
            continue;
        }
        dependencies.push({
            site: `field '${field.name}'`,
            name: field.name,
            key: field.key,
            index: field.index,
            inferred: !field.key,
            keyed: field.keyed,
        });
    }

    return dependencies;
}

function suppliedParameters(className, model) {
    const supplied = new Set();
    for (const registration of model.registrations) {
        if (registration.key === className) {
            for (const parameter of registration.parameters) {
                supplied.add(parameter);
            }
        }
    }
    return supplied;
}

function report(problems, parsed, rule, index, message) {
    const at = positionOf(parsed.starts, index);
    if (parsed.ignored.has(at.line)) {
        return;
    }
    problems.push({
        rule,
        file: parsed.file,
        line: at.line,
        column: at.column,
        message,
    });
}

function checkRegistrations(model, problems) {
    for (const parsed of model.files) {
        for (const registration of parsed.registrations) {
            if (registration.call !== 'register' || !registration.constructs) {
                continue;
            }
            if (!registration.literal && !model.tokens.has(registration.key)) {
                continue;
            }
            const shown = registration.literal ? `'${registration.key}'` : registration.key;
            report(
                problems,
                parsed,
                'key-as-class',
                registration.index,
                `register(${shown}) asks the container to construct a key, not a class. `
                + `Register the class and name it with .as(${shown}), `
                + 'or hand over an instance with registerInstance / registerFactory.',
            );
        }
    }
}

function checkClasses(model, problems, options) {
    const anyRegistration = model.registrations.length > 0;

    for (const parsed of model.files) {
        for (const type of parsed.classes) {
            const injectable = type.decorators.filter((decorator) => decorator.name === 'injectable')[0];
            if (injectable && isEngineType(type, model)) {
                report(
                    problems,
                    parsed,
                    'component-injectable',
                    injectable.index,
                    `@injectable on ${type.name}, which Cocos constructs itself. `
                    + 'Drop it and let the container fill the fields, which is what @inject is for.',
                );
            }

            for (const dependency of dependenciesOf(type, model)) {
                checkDependency(model, problems, parsed, type, dependency, anyRegistration, options);
            }
        }
    }
}

function checkDependency(model, problems, parsed, type, dependency, anyRegistration, options) {
    if (dependency.key) {
        if (options.ignore.has(dependency.key.name) || model.registered.has(dependency.key.name)) {
            return;
        }
        if (!anyRegistration) {
            return;
        }
        const shown = dependency.key.literal ? `'${dependency.key.name}'` : dependency.key.name;
        report(
            problems,
            parsed,
            'missing-registration',
            dependency.index,
            `${type.name} asks for ${shown} (${dependency.site}), which nothing in this project registers.`,
        );
        return;
    }

    const inferred = inferredKey(dependency.name, model);
    if (!inferred) {
        report(
            problems,
            parsed,
            'no-key',
            dependency.index,
            `${type.name} has no key for ${dependency.site}: nothing registered goes by that name. `
            + hint(dependency),
        );
        return;
    }
    if (inferred.registered || options.ignore.has(inferred.name) || !anyRegistration) {
        return;
    }
    report(
        problems,
        parsed,
        'missing-registration',
        dependency.index,
        `${type.name} asks for ${inferred.name} (${dependency.site}, by name), `
        + 'which nothing in this project registers.',
    );
}

function hint(dependency) {
    const pascal = dependency.name.replace(/^_+/, '');
    if (dependency.site.startsWith('field')) {
        return `Name the key, as in @inject(${pascal.charAt(0).toUpperCase()}${pascal.slice(1)}).`;
    }
    return `Pass it to @injectable(...) in constructor order, or give it a value with .withParameter('${dependency.name}', ...).`;
}

/** Follows what each registered class asks for until it comes back to itself. */
function checkCycles(model, problems) {
    const walking = new Set();
    const settled = new Set();
    const reported = new Set();
    const path = [];

    for (const name of model.provider.values()) {
        walk(name, null);
    }

    function walk(className, site) {
        const type = model.classes.get(className);
        if (!type || settled.has(className)) {
            return;
        }
        if (walking.has(className)) {
            reportCycle([...path, { className, site }]);
            return;
        }

        walking.add(className);
        path.push({ className, site });
        for (const dependency of dependenciesOf(type, model)) {
            const key = dependency.key
                ? dependency.key.name
                : (inferredKey(dependency.name, model) || {}).name;
            const provider = key && model.provider.get(key);
            if (provider) {
                walk(provider, dependency.site);
            }
        }
        path.pop();
        walking.delete(className);
        settled.add(className);
    }

    function reportCycle(steps) {
        const closing = steps[steps.length - 1];
        const loop = steps.slice(steps.findIndex((step) => step.className === closing.className));
        const identity = loop.slice(1).map((step) => step.className).sort().join(',');
        if (reported.has(identity)) {
            return;
        }
        reported.add(identity);

        const chain = loop
            .map((step, index) => (index === 0 ? step.className : `${step.className} (${step.site})`))
            .join(' -> ');
        const type = model.classes.get(closing.className);
        const parsed = model.files.filter((one) => one.file === type.file)[0];
        report(
            problems,
            parsed,
            'circular-dependency',
            type.index,
            `Circular dependency: ${chain}. `
            + 'Break it by taking IObjectResolver and resolving one side when it is needed, '
            + 'or by handing one side over with registerFactory.',
        );
    }
}

function severityOf(rule, options) {
    const severity = options.rules[rule];
    return severity === undefined ? DEFAULT_RULES[rule] : severity;
}

/** Reads sources already in memory, which is what the tests and the editor do. */
function analyzeSources(sources, settings) {
    const options = {
        ignore: new Set((settings && settings.ignore) || []),
        rules: (settings && settings.rules) || {},
    };
    const parsedFiles = sources.map((source) => parseFile(source.file, source.text));
    const model = buildModel(parsedFiles);
    const problems = [];

    for (const parsed of parsedFiles) {
        for (const problem of parsed.problems) {
            report(problems, parsed, problem.rule, problem.index, problem.message);
        }
    }
    checkRegistrations(model, problems);
    checkClasses(model, problems, options);
    checkCycles(model, problems);

    const kept = [];
    for (const problem of problems) {
        const severity = severityOf(problem.rule, options);
        if (severity === 'off') {
            continue;
        }
        kept.push(Object.assign({ severity: severity || 'error' }, problem));
    }
    kept.sort((a, b) => (a.file === b.file ? a.line - b.line : (a.file < b.file ? -1 : 1)));

    return {
        problems: kept,
        errors: kept.filter((problem) => problem.severity === 'error').length,
        warnings: kept.filter((problem) => problem.severity === 'warn').length,
        scanned: sources.length,
        registrations: model.registrations.length,
    };
}

/** Reads every source the config points at. */
function analyzeProject(config) {
    const settings = config || {};
    let files = settings.files;
    if (!files) {
        files = [];
        for (const root of settings.roots || []) {
            collectFiles(root, files, settings.exclude);
        }
    }

    const sources = [];
    for (const file of files) {
        try {
            sources.push({ file, text: fs.readFileSync(file, 'utf8') });
        } catch (_error) {
            // A file that vanished mid-scan is not something to report on.
        }
    }
    return analyzeSources(sources, settings.validate || settings);
}

function formatProblem(problem, projectRoot) {
    const file = projectRoot ? path.relative(projectRoot, problem.file) : problem.file;
    return `${file}:${problem.line}:${problem.column}  ${problem.severity}  ${problem.message} [${problem.rule}]`;
}

module.exports = {
    RULES,
    DEFAULT_RULES,
    BUILT_IN_KEYS,
    analyzeProject,
    analyzeSources,
    formatProblem,
};
