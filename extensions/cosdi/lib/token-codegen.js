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

/**
 * Rewrites one file's source. Generated lines are dropped and rebuilt from the
 * tags that are present, so running this repeatedly is a no-op.
 */
function transformSource(source, options) {
    const importFrom = (options && options.importFrom) || 'cosdi';
    const eol = detectEol(source);
    const text = stripGenerated(source);
    const { masked, comments } = maskCode(text);
    const edits = [];
    const tokens = [];
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

        const tokenName = tag[1] || target.name;
        const line = target.indent + (target.exported ? 'export ' : '')
            + 'const ' + target.name + ' = createToken<' + target.name + ">('" + tokenName + "'); // " + MARKER;
        edits.push({ at: endOfLine(text, target.end), text: eol + line });
        tokens.push({ name: target.name, tokenName });
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

function collectFiles(root, files) {
    let entries;
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (_error) {
        return files;
    }
    for (const entry of entries) {
        const full = path.join(root, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.indexOf(entry.name) < 0) {
                collectFiles(full, files);
            }
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            files.push(full);
        }
    }
    return files;
}

/**
 * Generates tokens for every tagged interface under `roots`.
 * With `check`, nothing is written and `changed` lists the stale files.
 */
function generateTokens(options) {
    const roots = (options && options.roots) || [];
    const check = !!(options && options.check);
    const result = { scanned: 0, tokens: 0, changed: [], warnings: [] };

    for (const root of roots) {
        for (const file of collectFiles(root, [])) {
            const source = fs.readFileSync(file, 'utf8');
            if (source.indexOf('@createToken') < 0 && source.indexOf(MARKER) < 0) {
                result.scanned++;
                continue;
            }
            const output = transformSource(source, options);
            result.scanned++;
            result.tokens += output.tokens.length;
            for (const warning of output.warnings) {
                result.warnings.push(file + ': ' + warning);
            }
            if (output.text !== source) {
                result.changed.push(file);
                if (!check) {
                    fs.writeFileSync(file, output.text, 'utf8');
                }
            }
        }
    }

    return result;
}

module.exports = { MARKER, generateTokens, transformSource, collectFiles };
