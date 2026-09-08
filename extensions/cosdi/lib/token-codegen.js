'use strict';

/**
 * Turns `@createToken` tags on interfaces into runtime tokens.
 *
 * TypeScript rejects decorators on an interface, and an interface leaves no
 * value behind to decorate. This writes the value the decorator would have
 * produced next to the interface it belongs to.
 */

const fs = require('fs');
const path = require('path');

const MARKER = 'cosdi:token';
const TAG = /@createToken\b[ \t]*(?:\([ \t]*['"]([^'"]+)['"][ \t]*\))?/;
const GENERATED_LINE = new RegExp(
    '^[ \\t]*(?:export[ \\t]+)?const[ \\t]+[A-Za-z_$][\\w$]*[ \\t]*=[ \\t]*createToken<[^>]*>\\([^)]*\\);[ \\t]*\\/\\/[ \\t]*'
    + MARKER + '[ \\t]*$',
);
const DECLARATION = /^(export[ \t]+)?(declare[ \t]+)?(abstract[ \t]+)?(interface|class|type|enum|function|const)[ \t]+([A-Za-z_$][\w$]*)/;
const SKIP_DIRS = ['node_modules', '.git', 'library', 'temp', 'build', 'local', 'profiles', 'native', 'CosDI'];

function isRegexStart(prev) {
    return prev === '' || '(,=:[!&|?{};+-*%~^<>'.indexOf(prev) >= 0;
}

/**
 * Replaces comment and string contents with spaces so declarations can be
 * matched without tripping over text that only looks like code. Offsets and
 * line breaks are preserved, so masked indexes map straight back to `source`.
 */
function maskCode(source) {
    const chars = source.split('');
    const comments = [];
    const stack = [{ template: false, depth: 0 }];
    let index = 0;
    let prev = '';

    const blank = (from, to) => {
        for (let i = from; i < to && i < chars.length; i++) {
            if (chars[i] !== '\n' && chars[i] !== '\r') {
                chars[i] = ' ';
            }
        }
    };

    while (index < source.length) {
        const top = stack[stack.length - 1];
        const char = source[index];

        if (top.template) {
            if (char === '\\') {
                blank(index, index + 2);
                index += 2;
            } else if (char === '`') {
                stack.pop();
                index++;
                prev = '`';
            } else if (char === '$' && source[index + 1] === '{') {
                stack.push({ template: false, depth: 0 });
                index += 2;
                prev = '{';
            } else {
                blank(index, index + 1);
                index++;
            }
            continue;
        }

        const pair = source.substr(index, 2);
        if (pair === '//') {
            let end = source.indexOf('\n', index);
            end = end < 0 ? source.length : end;
            comments.push({ start: index, end, text: source.slice(index, end) });
            blank(index, end);
            index = end;
            continue;
        }
        if (pair === '/*') {
            const close = source.indexOf('*/', index + 2);
            const end = close < 0 ? source.length : close + 2;
            comments.push({ start: index, end, text: source.slice(index, end) });
            blank(index, end);
            index = end;
            continue;
        }
        if (char === '"' || char === "'") {
            let cursor = index + 1;
            while (cursor < source.length && source[cursor] !== char && source[cursor] !== '\n') {
                cursor += source[cursor] === '\\' ? 2 : 1;
            }
            blank(index + 1, cursor);
            index = Math.min(cursor + 1, source.length);
            prev = char;
            continue;
        }
        if (char === '`') {
            stack.push({ template: true, depth: 0 });
            index++;
            continue;
        }
        if (char === '/' && isRegexStart(prev)) {
            let cursor = index + 1;
            let inClass = false;
            while (cursor < source.length && source[cursor] !== '\n') {
                const current = source[cursor];
                if (current === '\\') {
                    cursor += 2;
                    continue;
                }
                if (current === '[') {
                    inClass = true;
                } else if (current === ']') {
                    inClass = false;
                } else if (current === '/' && !inClass) {
                    break;
                }
                cursor++;
            }
            blank(index + 1, cursor);
            index = Math.min(cursor + 1, source.length);
            prev = '/';
            continue;
        }
        if (char === '{') {
            top.depth++;
        } else if (char === '}') {
            if (top.depth === 0 && stack.length > 1) {
                stack.pop();
                index++;
                prev = '}';
                continue;
            }
            top.depth--;
        }
        if (!/\s/.test(char)) {
            prev = char;
        }
        index++;
    }

    return { masked: chars.join(''), comments };
}

function detectEol(source) {
    return source.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
}

function stripGenerated(source) {
    const lines = source.split(/(\r?\n)/);
    const kept = [];
    for (let i = 0; i < lines.length; i += 2) {
        if (GENERATED_LINE.test(lines[i])) {
            continue;
        }
        kept.push(lines[i]);
        if (lines[i + 1] !== undefined) {
            kept.push(lines[i + 1]);
        }
    }
    return kept.join('');
}

function matchBrace(masked, open) {
    let depth = 0;
    for (let i = open; i < masked.length; i++) {
        if (masked[i] === '{') {
            depth++;
        } else if (masked[i] === '}') {
            depth--;
            if (depth === 0) {
                return i + 1;
            }
        }
    }
    return -1;
}

/** Reads the interface a tag applies to, or explains why it cannot be used. */
function readTaggedInterface(masked, from) {
    const rest = masked.slice(from);
    const lead = /^\s*/.exec(rest)[0].length;
    const start = from + lead;
    const declaration = DECLARATION.exec(masked.slice(start));
    if (!declaration) {
        return { error: 'tag is not followed by a declaration' };
    }

    const keyword = declaration[4];
    const name = declaration[5];
    if (keyword !== 'interface') {
        if (keyword === 'class') {
            return { error: 'classes hold their own key, so use the @createToken decorator on ' + name };
        }
        return { error: 'only interfaces are supported, found ' + keyword + ' ' + name };
    }
    if (declaration[2]) {
        return { error: name + ' is ambient, so it cannot own a runtime token' };
    }

    const afterName = start + declaration[0].length;
    const tail = masked.slice(afterName);
    if (/^\s*</.test(tail)) {
        return { error: name + ' is generic, so it needs one token per type argument' };
    }

    const open = masked.indexOf('{', afterName);
    if (open < 0) {
        return { error: name + ' has no body' };
    }
    const end = matchBrace(masked, open);
    if (end < 0) {
        return { error: name + ' has an unbalanced body' };
    }

    const lineStart = masked.lastIndexOf('\n', start) + 1;
    return {
        name,
        exported: !!declaration[1],
        indent: /^[ \t]*/.exec(masked.slice(lineStart, start))[0],
        end,
    };
}

function endOfLine(source, index) {
    const next = source.indexOf('\n', index);
    if (next < 0) {
        return source.length;
    }
    return source[next - 1] === '\r' ? next - 1 : next;
}

function hasBinding(masked, name) {
    return new RegExp('\\b(?:const|let|var|class|function|enum)\\s+' + name + '\\b').test(masked);
}

/** First offset that is neither leading whitespace nor a banner comment. */
function afterBanner(text, comments) {
    let at = 0;
    let next = 0;
    for (;;) {
        while (at < text.length && /\s/.test(text[at])) {
            at++;
        }
        while (next < comments.length && comments[next].start < at) {
            next++;
        }
        const comment = comments[next];
        if (comment && comment.start === at && !TAG.test(comment.text)) {
            at = comment.end;
            continue;
        }
        return at;
    }
}

function importEdit(text, masked, comments, eol, importFrom) {
    if (/\bimport\s*(?:type\s*)?\{[^}]*\bcreateToken\b[^}]*\}/.test(masked)) {
        return null;
    }

    // Module specifiers are blanked in `masked`, so match the statement there
    // and read the specifier back out of the original text.
    const statement = /import\s[^;]*;/g;
    let last = null;
    let match = statement.exec(masked);
    while (match) {
        const raw = text.substr(match.index, match[0].length);
        const brace = raw.indexOf('{');
        if (brace >= 0 && (raw.indexOf("'" + importFrom + "'") >= 0 || raw.indexOf('"' + importFrom + '"') >= 0)) {
            return { at: match.index + brace + 1, text: ' createToken,' };
        }
        last = match;
        match = statement.exec(masked);
    }

    const line = "import { createToken } from '" + importFrom + "';";
    if (last) {
        return { at: last.index + last[0].length, text: eol + line };
    }
    return { at: afterBanner(text, comments), text: line + eol + eol };
}

/** Every tagged interface in `text`, with the reason for each one skipped. */
function findTagged(text) {
    const { masked, comments } = maskCode(text);
    const targets = [];
    const warnings = [];

    for (const comment of comments) {
        const tag = TAG.exec(comment.text);
        if (!tag) {
            continue;
        }
        const target = readTaggedInterface(masked, comment.end);
        if (target.error) {
            warnings.push('@createToken skipped: ' + target.error);
            continue;
        }
        if (hasBinding(masked, target.name)) {
            warnings.push('@createToken skipped: ' + target.name + ' already has a value declaration');
            continue;
        }
        target.tokenName = tag[1] || target.name;
        targets.push(target);
    }

    return { masked, comments, targets, warnings };
}

/**
 * Rewrites one file's source. Generated lines are dropped and rebuilt from the
 * tags that are present, so running this repeatedly is a no-op.
 */
function transformSource(source, options) {
    const importFrom = (options && options.importFrom) || 'cosdi';
    const eol = detectEol(source);
    const text = stripGenerated(source);
    const { masked, comments, targets, warnings } = findTagged(text);
    const edits = [];
    const tokens = [];

    for (const target of targets) {
        const line = target.indent + (target.exported ? 'export ' : '')
            + 'const ' + target.name + ' = createToken<' + target.name + ">('" + target.tokenName + "'); // " + MARKER;
        edits.push({ at: endOfLine(text, target.end), text: eol + line });
        tokens.push({ name: target.name, tokenName: target.tokenName });
    }

    if (!tokens.length) {
        return { text, tokens, warnings };
    }

    const addImport = importEdit(text, masked, comments, eol, importFrom);
    if (addImport) {
        edits.push(addImport);
    }

    edits.sort((a, b) => b.at - a.at);
    let output = text;
    for (const edit of edits) {
        output = output.slice(0, edit.at) + edit.text + output.slice(edit.at);
    }
    return { text: output, tokens, warnings };
}

function collectFiles(root, files, exclude) {
    const skip = exclude ? SKIP_DIRS.concat(exclude) : SKIP_DIRS;
    let entries;
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (_error) {
        return files;
    }
    for (const entry of entries) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) {
            if (skip.indexOf(entry.name) < 0) {
                collectFiles(full, files, exclude);
            }
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            files.push(full);
        }
    }
    return files;
}

const MODES = ['inline', 'file', 'package'];
const DEFAULT_CONFIG = {
    roots: ['assets'],
    exclude: [],
    mode: 'inline',
    out: 'assets/cosdi-tokens.generated.ts',
    packageName: 'cosdi-tokens',
    generateOnSave: true,
    importFrom: 'cosdi',
};

/**
 * Reads `cosdi.codegen.json` from the project root. Every field is optional;
 * a missing or unreadable file just means the defaults apply.
 */
function loadConfig(projectRoot) {
    const file = path.join(projectRoot, 'cosdi.codegen.json');
    let raw = {};
    let error = null;
    if (fs.existsSync(file)) {
        try {
            raw = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
        } catch (parseError) {
            error = 'cosdi.codegen.json is not valid JSON: ' + parseError.message;
            raw = {};
        }
    }

    const roots = Array.isArray(raw.roots) && raw.roots.length ? raw.roots : DEFAULT_CONFIG.roots;
    const mode = MODES.indexOf(raw.mode) >= 0 ? raw.mode : DEFAULT_CONFIG.mode;
    const packageName = raw.packageName || DEFAULT_CONFIG.packageName;
    const defaultOut = mode === 'package'
        ? path.join('node_modules', packageName)
        : DEFAULT_CONFIG.out;

    return {
        projectRoot,
        roots: roots.map((root) => path.resolve(projectRoot, root)),
        exclude: Array.isArray(raw.exclude) ? raw.exclude : DEFAULT_CONFIG.exclude,
        mode,
        out: path.resolve(projectRoot, raw.out || defaultOut),
        packageName,
        generateOnSave: raw.generateOnSave !== false,
        importFrom: raw.importFrom || DEFAULT_CONFIG.importFrom,
        error,
    };
}

function importSpecifier(fromFile, toFile) {
    let relative = path.relative(path.dirname(fromFile), toFile).split(path.sep).join('/');
    relative = relative.replace(/\.ts$/, '');
    return relative.startsWith('.') ? relative : './' + relative;
}

/** Builds the single module that holds every token in `file` mode. */
function buildTokensModule(entries, out, importFrom, eol) {
    const lines = [
        '// Generated by CosDI from @createToken interfaces. Do not edit.',
        "import { createToken } from '" + importFrom + "';",
    ];
    for (const entry of entries) {
        lines.push('import type { ' + entry.name + ' as ' + entry.alias + " } from '"
            + importSpecifier(out, entry.file) + "';");
    }
    lines.push('');
    for (const entry of entries) {
        lines.push('export type ' + entry.name + ' = ' + entry.alias + ';');
        lines.push('export const ' + entry.name + ' = createToken<' + entry.alias + ">('" + entry.tokenName + "');");
    }
    return lines.join(eol) + eol;
}

function writeIfChanged(file, text, check, result) {
    let current = null;
    if (fs.existsSync(file)) {
        current = fs.readFileSync(file, 'utf8');
    }
    if (current === text) {
        return;
    }
    result.changed.push(file);
    if (!check) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text, 'utf8');
    }
}

function generateInline(files, options, result) {
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        result.scanned++;
        if (source.indexOf('@createToken') < 0 && source.indexOf(MARKER) < 0) {
            continue;
        }
        const output = transformSource(source, options);
        result.tokens += output.tokens.length;
        if (output.tokens.length) {
            result.sources.push(file);
        }
        for (const warning of output.warnings) {
            result.warnings.push(file + ': ' + warning);
        }
        if (output.text !== source) {
            result.changed.push(file);
            if (!options.check) {
                fs.writeFileSync(file, output.text, 'utf8');
            }
        }
    }
}

function remove(file, check, result) {
    if (!fs.existsSync(file)) {
        return;
    }
    result.changed.push(file);
    if (!check) {
        fs.unlinkSync(file);
    }
}

/** Collects tagged interfaces and clears inline tokens left in the sources. */
function collectEntries(files, options, result) {
    const entries = [];
    const seen = Object.create(null);

    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        result.scanned++;
        if (source.indexOf('@createToken') < 0 && source.indexOf(MARKER) < 0) {
            continue;
        }
        // Inline tokens would shadow the generated module, so clear them out.
        const stripped = stripGenerated(source);
        if (stripped !== source) {
            result.changed.push(file);
            if (!options.check) {
                fs.writeFileSync(file, stripped, 'utf8');
            }
        }

        const found = findTagged(stripped);
        for (const warning of found.warnings) {
            result.warnings.push(file + ': ' + warning);
        }
        if (!found.targets.length) {
            continue;
        }
        result.sources.push(file);
        for (const target of found.targets) {
            if (seen[target.name]) {
                result.warnings.push(file + ': @createToken skipped: ' + target.name
                    + ' is already generated from ' + seen[target.name]);
                continue;
            }
            seen[target.name] = file;
            entries.push({ name: target.name, tokenName: target.tokenName, alias: target.name + '_', file });
            result.tokens++;
        }
    }

    entries.sort((a, b) => (a.name < b.name ? -1 : 1));
    return entries;
}

/** `file` mode: one generated module, which Creator only compiles under assets. */
function generateToModule(files, options, result) {
    const entries = collectEntries(files, options, result);
    if (options.projectRoot) {
        const assets = path.join(options.projectRoot, 'assets');
        const relative = path.relative(assets, options.out);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            result.warnings.push(options.out
                + ': Creator only compiles scripts under assets/. Use "mode": "package" to generate outside it.');
        }
    }
    if (!entries.length) {
        remove(options.out, options.check, result);
        return;
    }
    writeIfChanged(options.out, buildTokensModule(entries, options.out, options.importFrom || 'cosdi', '\n'), options.check, result);
}

/**
 * `package` mode: a local package outside assets. Creator resolves bare
 * specifiers with the Node algorithm, so `import { IFoo } from 'cosdi-tokens'`
 * works the same way the `cosdi` package itself does.
 */
function generateToPackage(files, options, result) {
    const entries = collectEntries(files, options, result);
    const index = path.join(options.out, 'index.ts');
    const manifest = path.join(options.out, 'package.json');

    if (!entries.length) {
        remove(index, options.check, result);
        remove(manifest, options.check, result);
        return;
    }

    writeIfChanged(index, buildTokensModule(entries, index, options.importFrom || 'cosdi', '\n'), options.check, result);
    writeIfChanged(manifest, JSON.stringify({
        name: options.packageName || DEFAULT_CONFIG.packageName,
        version: '0.0.0',
        private: true,
        description: 'Generated by CosDI from @createToken interfaces. Do not edit.',
        main: './index.ts',
        module: './index.ts',
        types: './index.ts',
        exports: { '.': './index.ts' },
    }, null, 2) + '\n', options.check, result);
}

/**
 * Generates tokens for the tagged interfaces under `roots`, or for `files`
 * alone when only part of the tree needs revisiting. With `check`, nothing is
 * written and `changed` lists what is stale.
 */
function generateTokens(options) {
    const settings = options || {};
    const result = { scanned: 0, tokens: 0, changed: [], sources: [], warnings: [] };
    let files = settings.files;

    if (!files) {
        files = [];
        for (const root of settings.roots || []) {
            collectFiles(root, files, settings.exclude);
        }
    }

    if (settings.mode === 'package') {
        generateToPackage(files, settings, result);
    } else if (settings.mode === 'file') {
        generateToModule(files, settings, result);
    } else {
        generateInline(files, settings, result);
    }

    return result;
}

module.exports = {
    MARKER,
    DEFAULT_CONFIG,
    loadConfig,
    generateTokens,
    transformSource,
    findTagged,
    collectFiles,
};
