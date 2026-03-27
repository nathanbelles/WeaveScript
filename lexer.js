/**
 * Splits mixed prompt text into plain text segments and tokenized WeaveScript blocks.
 */
export class WeaveScriptLexer {
    /**
     * Represents a single lexical token.
     *
     * @param {number} type Token type from `TokenType`.
     * @param {string} value Raw token text.
     */
    static Token = class {
        constructor(type, value) {
            this.type = type;
            this.value = value;
        }
    }

    /** A list of tokens belonging to a WeaveScript block. */
    static TokenList = class extends Array { }

    /**
     * Plain text segment found between WeaveScript blocks.
     *
     * @param {string} text Non-script text segment.
     */
    static PlainText = class {
        constructor(text) {
            this.text = text;
        }
    }

    /**
     * Lexer-specific error.
     *
     * @param {string} message Error details.
     */
    static LexerError = class extends Error {
        constructor(message) {
            super(message);
            this.name = "Lexer Error";
        }
    }

    /**
     * Creates a frozen enum-like object for token constants.
     *
     * @param {...string} keys Enum key names.
     * @returns {Readonly<Record<string, number>>} Frozen key-to-index map.
     */
    static createEnum (...keys) {
        const obj = {};
        keys.forEach((key, index) => {
            obj[key] = index;
        });
        return Object.freeze(obj);
    }

    /**
     * Enum-like token type IDs used by the lexer and parser.
     *
     * @type {Readonly<Record<string, number>>}
     */
    static TokenType = WeaveScriptLexer.createEnum(
        'BLOCK_START',
        'BLOCK_END',
        'WHITESPACE',
        'STATE_VAR',
        'KW_VAR',
        'KW_IF',
        'KW_THEN',
        'KW_ELSE',
        'KW_AND',
        'KW_OR',
        'KW_NOT',
        'KW_IS',
        'KW_BLANK',
        'BOOL',
        'NUMBER',
        'STRING',
        'OP_CMP',
        'OP_AND',
        'OP_OR',
        'OP_NOT',
        'OP_ASSIGN',
        'OP_ARITH',
        'LPAREN',
        'RPAREN',
        'SEMICOLON',
        'IDENTIFIER'
    );

    /**
     * Token matching regular expressions keyed by numeric token type ID.
     *
     * @type {Readonly<Record<number, RegExp>>}
     */
    static TOKENS = Object.freeze( {
        [WeaveScriptLexer.TokenType.BLOCK_START]: /#\{/,
        [WeaveScriptLexer.TokenType.BLOCK_END]: /\}/,
        [WeaveScriptLexer.TokenType.WHITESPACE]: /[ \t\r\n]+/,
        [WeaveScriptLexer.TokenType.STATE_VAR]: /\$[a-zA-Z_][a-zA-Z0-9_]*/,
        [WeaveScriptLexer.TokenType.KW_VAR]: /\b(?:var|set)\b/,
        [WeaveScriptLexer.TokenType.KW_IF]: /\bif\b/,
        [WeaveScriptLexer.TokenType.KW_THEN]: /\bthen\b/,
        [WeaveScriptLexer.TokenType.KW_ELSE]: /\belse\b/,
        [WeaveScriptLexer.TokenType.KW_AND]: /\band\b/,
        [WeaveScriptLexer.TokenType.KW_OR]: /\bor\b/,
        [WeaveScriptLexer.TokenType.KW_NOT]: /\bnot\b/,
        [WeaveScriptLexer.TokenType.KW_IS]: /\bis\b/,
        [WeaveScriptLexer.TokenType.KW_BLANK]: /\bblank\b/,
        [WeaveScriptLexer.TokenType.BOOL]: /\b(?:true|false)\b/,
        [WeaveScriptLexer.TokenType.NUMBER]: /\d+(?:\.\d+)?/,
        [WeaveScriptLexer.TokenType.STRING]: /(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
        [WeaveScriptLexer.TokenType.OP_CMP]: /==|!=|<=|>=|<|>/,
        [WeaveScriptLexer.TokenType.OP_AND]: /&&/,
        [WeaveScriptLexer.TokenType.OP_OR]: /\|\|/,
        [WeaveScriptLexer.TokenType.OP_NOT]: /!/,
        [WeaveScriptLexer.TokenType.OP_ASSIGN]: /=/,
        [WeaveScriptLexer.TokenType.OP_ARITH]: /[+\-*\/%]/,
        [WeaveScriptLexer.TokenType.LPAREN]: /\(/,
        [WeaveScriptLexer.TokenType.RPAREN]: /\)/,
        [WeaveScriptLexer.TokenType.SEMICOLON]: /;/,
        [WeaveScriptLexer.TokenType.IDENTIFIER]: /[a-zA-Z_][a-zA-Z0-9_]*/,
    });

    /**
     * Human-readable token names used in error messages.
     *
     * @type {Readonly<Record<number, string>>}
     */
    static TOKEN_NAMES = Object.freeze( {
        [WeaveScriptLexer.TokenType.BLOCK_START]: "#{",
        [WeaveScriptLexer.TokenType.BLOCK_END]: "}",
        [WeaveScriptLexer.TokenType.WHITESPACE]: "whitespace",
        [WeaveScriptLexer.TokenType.STATE_VAR]: "state variable",
        [WeaveScriptLexer.TokenType.KW_VAR]: "var or set",
        [WeaveScriptLexer.TokenType.KW_IF]: "if",
        [WeaveScriptLexer.TokenType.KW_THEN]: "then",
        [WeaveScriptLexer.TokenType.KW_ELSE]: "else",
        [WeaveScriptLexer.TokenType.KW_AND]: "and",
        [WeaveScriptLexer.TokenType.KW_OR]: "or",
        [WeaveScriptLexer.TokenType.KW_NOT]: "not",
        [WeaveScriptLexer.TokenType.KW_IS]: "is",
        [WeaveScriptLexer.TokenType.KW_BLANK]: "blank",
        [WeaveScriptLexer.TokenType.BOOL]: "true or false",
        [WeaveScriptLexer.TokenType.NUMBER]: "a number",
        [WeaveScriptLexer.TokenType.STRING]: "a string",
        [WeaveScriptLexer.TokenType.OP_CMP]: "a relationalal operator",
        [WeaveScriptLexer.TokenType.OP_AND]: "&&",
        [WeaveScriptLexer.TokenType.OP_OR]: "||",
        [WeaveScriptLexer.TokenType.OP_NOT]: "!",
        [WeaveScriptLexer.TokenType.OP_ASSIGN]: "=",
        [WeaveScriptLexer.TokenType.OP_ARITH]: "an aritmentic operator",
        [WeaveScriptLexer.TokenType.LPAREN]: "(",
        [WeaveScriptLexer.TokenType.RPAREN]: ")",
        [WeaveScriptLexer.TokenType.SEMICOLON]: ";",
        [WeaveScriptLexer.TokenType.IDENTIFIER]: "an identifier",
    });

    /**
     * Finds the closing `}` for a `#{` block while respecting quoted strings.
     *
     * @param {string} source Full source text.
     * @param {number} start Index to start scanning from.
     * @returns {number} Index of the matching closing brace.
     * @throws {WeaveScriptLexer.LexerError} If no closing brace is found.
     */
    static findBlockEnd(source, start) {
        let inString = false;
        let quote = '';
        for (let i = start; i < source.length; i++) {
            const ch = source[i];
            if (inString) {
                if (ch === '\\') {
                    i++;
                    continue;
                }
                if (ch === quote) {
                    inString = false;
                }
            } else if (ch === '"' || ch === "'") {
                inString = true;
                quote = ch;
            } else if (ch === '}') {
                return i;
            }
        }
        throw new WeaveScriptLexer.LexerError('Unclosed #{ block');
    }
    
    /**
     * Tokenizes text into plain text segments and tokenized WeaveScript blocks.
     *
     * @param {string} source Source text containing zero or more `#{...}` blocks.
     * @returns {(WeaveScriptLexer.PlainText|WeaveScriptLexer.TokenList)[]} Ordered segments.
     * @throws {WeaveScriptLexer.LexerError} On malformed script syntax.
     */
    static tokenize(source) {
        let segments = [];
        let cursor = 0;

        while(cursor < source.length) {
            const blockPattern = new RegExp(WeaveScriptLexer.TOKENS[WeaveScriptLexer.TokenType.BLOCK_START], "y");
            const blockMatch = source.slice(cursor).match(blockPattern);
            if(blockMatch) {
                const blockStart = cursor + 2;
                const blockEnd = this.findBlockEnd(source, blockStart);
                const blockSrc = source.slice(blockStart, blockEnd);

                let tokens = new this.TokenList;
                let pos = 0;
                while(pos < blockSrc.length) {
                    let matched = false;
                    for(const [type,pattern] of Object.entries(WeaveScriptLexer.TOKENS)) {
                        const numberType = Number(type);
                        const stickyPattern = new RegExp(pattern, "y");
                        const localSrc = blockSrc.slice(pos);
                        const match = localSrc.match(stickyPattern);
                        if(match) {
                            if(numberType !== WeaveScriptLexer.TokenType.WHITESPACE) {
                                tokens.push(new WeaveScriptLexer.Token(numberType, match[0]));
                            }
                            pos += match[0].length;
                            matched = true;
                            break;
                        }
                    }
                    if(!matched) {
                        throw new WeaveScriptLexer.LexerError(`Unexpected character '${blockSrc.slice(pos, pos+1)}' at position ${blockStart + pos + 1}`);
                    }

                }
                segments.push(tokens);
                cursor = blockEnd + 1;
            } else {
                const nextBlock = source.slice(cursor).match(WeaveScriptLexer.TOKENS[WeaveScriptLexer.TokenType.BLOCK_START]);
                if(nextBlock) {
                    segments.push(new WeaveScriptLexer.PlainText(source.slice(cursor, cursor + nextBlock.index)));
                    cursor += nextBlock.index;
                } else {
                    segments.push(new WeaveScriptLexer.PlainText(source.slice(cursor)));
                    cursor = source.length;
                }
            }
        }
        return segments;
    }


}
