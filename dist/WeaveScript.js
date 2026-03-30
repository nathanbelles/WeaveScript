var WeaveScript = (function (exports) {
    'use strict';

    /**
     * Splits mixed prompt text into plain text segments and tokenized WeaveScript blocks.
     */
    class WeaveScriptLexer {
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
            /**
             * @param {string} message Error details.
             * @param {string} src Source context (typically the raw `#{...}` block).
             */
            constructor(message, src) {
                super(message);
                this.src = src;
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
            'NULL',
            'BOOL',
            'NUMBER',
            'STRING',
            'OP_CMP',
            'OP_AND',
            'OP_OR',
            'OP_NULLCOAL',
            'OP_TERNARY',
            'OP_NOT',
            'OP_ASSIGN',
            'OP_ARITH',
            'LPAREN',
            'RPAREN',
            'SEMICOLON',
            'COLON',
            'COMMA',
            'FUNC',
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
            [WeaveScriptLexer.TokenType.NULL]: /\b(?:null|undefined)\b/,
            [WeaveScriptLexer.TokenType.BOOL]: /\b(?:true|false)\b/,
            [WeaveScriptLexer.TokenType.NUMBER]: /\d+(?:\.\d+)?/,
            [WeaveScriptLexer.TokenType.STRING]: /(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
            [WeaveScriptLexer.TokenType.OP_CMP]: /==|!=|<=|>=|<|>/,
            [WeaveScriptLexer.TokenType.OP_AND]: /&&/,
            [WeaveScriptLexer.TokenType.OP_OR]: /\|\|/,
            [WeaveScriptLexer.TokenType.OP_NULLCOAL]: /\?\?/,
            [WeaveScriptLexer.TokenType.OP_TERNARY]: /\?/,
            [WeaveScriptLexer.TokenType.OP_NOT]: /!/,
            [WeaveScriptLexer.TokenType.OP_ASSIGN]: /=/,
            [WeaveScriptLexer.TokenType.OP_ARITH]: /[+\-*\/%]/,
            [WeaveScriptLexer.TokenType.LPAREN]: /\(/,
            [WeaveScriptLexer.TokenType.RPAREN]: /\)/,
            [WeaveScriptLexer.TokenType.SEMICOLON]: /;/,
            [WeaveScriptLexer.TokenType.COLON]: /:/,
            [WeaveScriptLexer.TokenType.COMMA]: /,/,
            [WeaveScriptLexer.TokenType.FUNC]: /[a-zA-Z_][a-zA-Z0-9_]*(?=\()/,
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
            [WeaveScriptLexer.TokenType.NULL]: "null or undefined",
            [WeaveScriptLexer.TokenType.BOOL]: "true or false",
            [WeaveScriptLexer.TokenType.NUMBER]: "a number",
            [WeaveScriptLexer.TokenType.STRING]: "a string",
            [WeaveScriptLexer.TokenType.OP_CMP]: "a relational operator",
            [WeaveScriptLexer.TokenType.OP_AND]: "&&",
            [WeaveScriptLexer.TokenType.OP_OR]: "||",
            [WeaveScriptLexer.TokenType.OP_NULLCOAL]: "??",
            [WeaveScriptLexer.TokenType.OP_TERNARY]: "?",
            [WeaveScriptLexer.TokenType.OP_NOT]: "!",
            [WeaveScriptLexer.TokenType.OP_ASSIGN]: "=",
            [WeaveScriptLexer.TokenType.OP_ARITH]: "an aritmentic operator",
            [WeaveScriptLexer.TokenType.LPAREN]: "(",
            [WeaveScriptLexer.TokenType.RPAREN]: ")",
            [WeaveScriptLexer.TokenType.SEMICOLON]: ";",
            [WeaveScriptLexer.TokenType.COLON]: ":",
            [WeaveScriptLexer.TokenType.COMMA]: ",",
            [WeaveScriptLexer.TokenType.FUNC]: "a function identifier",
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
            throw new WeaveScriptLexer.LexerError('Unclosed #{ block', source.slice(start - 2));
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
                    // Preserve original block source for downstream error reporting.
                    // This is intentionally stored on the TokenList instance (not on individual tokens).
                    tokens.blockSrc = blockSrc;
                    tokens.rawBlock = `#{${blockSrc}}`;
                    tokens.blockStart = blockStart - 2; // index of '#'
                    tokens.blockEnd = blockEnd + 1;     // index after '}'
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
                            throw new WeaveScriptLexer.LexerError(`Unexpected character '${blockSrc.slice(pos, pos+1)}' at position ${blockStart + pos + 1}`,tokens.rawBlock);
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

    /**
     * Recursive-descent parser for WeaveScript token streams.
     */
    class WeaveScriptParser {
        /**
         * Parser-specific error.
         *
         * @param {string} message Error details.
         */
        static ParserError = class extends Error {
            constructor(message) {
                super(message);
                this.name = "Parser Error";
            }
        }

        /** AST node representing `var/set Name = value`. */
        static VarDecl = class {
            /**
             * @param {string} identifier Variable name.
             * @param {object} value Expression AST node.
             */
            constructor(identifier, value) {
                this.identifier = identifier;
                this.value = value;
            }
        }

        /** AST node representing `if ... then ... else ...`. */
        static IfExpr = class {
            /**
             * @param {object} condition Condition expression node.
             * @param {object} consequent Node returned when condition is truthy.
             * @param {object|null} alternate Optional node for false branch.
             */
            constructor(condition, consequent, alternate) {
                this.condition = condition;
                this.consequent = consequent;
                this.alternate = alternate;
            }
        }

        /** AST node representing a binary operation. */
        static BinaryOp = class {
            /**
             * @param {string} operator Operator token value.
             * @param {object} left Left operand node.
             * @param {object} right Right operand node.
             */
            constructor(operator, left, right) {
                this.operator = operator;
                this.left = left;
                this.right = right;
            }
        }

        /** AST node representing a unary operation. */
        static UnaryOp = class {
            /**
             * @param {string} operator Operator token value.
             * @param {object} operand Operand node.
             */
            constructor(operator, operand) {
                this.operator = operator;
                this.operand = operand;
            }
        }

        /** AST node for number literals. */
        static NumberLiteral = class {
            /**
             * @param {string} value Numeric token text.
             */
            constructor(value) {
                this.value = value;
            }
        }

        /** AST node for string literals. */
        static StringLiteral = class {
            /**
             * @param {string} value Quoted string token text.
             */
            constructor(value) {
                this.value = value;
            }
        }

        /** AST node for boolean literals. */
        static BoolLiteral = class {
            /**
             * @param {boolean} value Boolean value.
             */
            constructor(value) {
                this.value = value;
            }
        }

        /** AST node for null literals. */
        static NullLiteral = class {
            constructor() { }
        }

        /** AST node for regular variable references. */
        static VariableRef = class {
            /**
             * @param {string} identifier Variable name.
             */
            constructor(identifier) {
                this.identifier = identifier;
            }
        }

        /** Root AST node containing ordered statements. */
        static Block = class {
            /**
             * @param {object[]} statements Statement/expression nodes.
             */
            constructor(statements) {
                this.statements = statements;
            }
        }

        /** AST node for state variable references (`$name`). */
        static StateVarRef = class {
            /**
             * @param {string} identifier State variable identifier.
             */
            constructor(identifier) {
                this.identifier = identifier;
            }
        }
        /** AST node for state variable assignment (`$name = expr`). */
        static StateVarAssign = class {
            /**
             * @param {string} identifier State variable identifier.
             * @param {object} value Expression node assigned to state variable.
             */
            constructor(identifier, value) {
                this.identifier = identifier;
                this.value = value;
            }
        }

        /** AST node representing a function call. */
        static FunctionCall = class {
            /**
             * @param {string} identifier Function name.
             * @param {object[]} args Argument expression nodes.
             */
            constructor(identifier, args) {
                this.identifier = identifier;
                this.args = args;
            }
        }

        /**
         * Creates a parser instance over a token stream for a single WeaveScript block.
         *
         * @param {Array<{type:number,value:string}>} tokens Token stream for one block.
         */
        constructor(tokens) {
            this.tokens = tokens;
            this.pos = 0;
        }

        /**
         * Returns the token at the current parser position without consuming it.
         *
         * @returns {{type:number,value:string}|undefined} Current token, or `undefined` at end of stream.
         */
        peek() {
            return this.tokens[this.pos];
        }
        /**
         * Returns a token relative to the current parser position without consuming it.
         *
         * @param {number} i Relative offset from current token.
         * @returns {{type:number,value:string}|undefined} Token at the requested offset, or `undefined`.
         */
        peekAhead(i) {
            return this.tokens[this.pos + i];
        }
        /**
         * Consumes and returns the current token, advancing the parser by one.
         *
         * @returns {{type:number,value:string}|undefined} Consumed token, or `undefined` if already at end.
         */
        advance() {
            return this.tokens[this.pos++];
        }
        /**
         * Consumes and returns the current token if its type matches.
         *
         * @param {number} type Expected token type.
         * @returns {{type:number,value:string}} Consumed token.
         * @throws {WeaveScriptParser.ParserError} If the current token does not match.
         */
        expect(type) {
            const token = this.peek();
            if(!token) {
                throw new WeaveScriptParser.ParserError(`Expected ${WeaveScriptLexer.TOKEN_NAMES[type]}, received end of input`);
            }
            if(token.type !== type) {
                throw new WeaveScriptParser.ParserError(`Expected ${WeaveScriptLexer.TOKEN_NAMES[type]}, received ${token.value}`);
            }
            return this.advance();
        }

        /**
         * Parses a full block into a `Block` node.
         *
         * @returns {WeaveScriptParser.Block} Root AST.
         */
        parseBlock() {
            const statements = [];
            while(this.pos < this.tokens.length) {
                statements.push(this.parseStatement());
                if (this.peek() && this.peek().type === WeaveScriptLexer.TokenType.SEMICOLON) {
                    this.advance();
                }
            }
            return new WeaveScriptParser.Block(statements);
        }

        /**
         * Parses a statement, handling declarations and state assignments.
         *
         * @returns {object} AST node.
         */
        parseStatement() {
            if(this.peek() && this.peek().type === WeaveScriptLexer.TokenType.KW_VAR) {
                return this.parseVarDecl();
            }
            if(this.peek() && 
                this.peek().type === WeaveScriptLexer.TokenType.STATE_VAR &&
                this.peekAhead(1)?.type === WeaveScriptLexer.TokenType.OP_ASSIGN) {
                const name = this.advance().value;
                this.advance();
                const value = this.parseExpression();
                return new WeaveScriptParser.StateVarAssign(name, value);
            }
            return this.parseExpression();
        }

        /**
         * Parses variable declaration syntax: `var/set Name = expression`.
         *
         * @returns {WeaveScriptParser.VarDecl} Variable declaration node.
         */
        parseVarDecl() {
            this.advance();
            const name = this.expect(WeaveScriptLexer.TokenType.IDENTIFIER).value;
            this.expect(WeaveScriptLexer.TokenType.OP_ASSIGN);
            const value = this.parseExpression();
            return new WeaveScriptParser.VarDecl(name, value);
        }

        /**
         * Parses ternary expressions (`condition ? consequent : alternate`).
         *
         * @returns {object} AST node for the ternary expression (or the underlying expression).
         */
        parseTernary() {
            const condition = this.parseNullCoal();
            if(this.peek() && this.peek().type === WeaveScriptLexer.TokenType.OP_TERNARY) {
                this.advance();
                const consequent = this.parseNullCoal();
                this.expect(WeaveScriptLexer.TokenType.COLON);
                const alternate = this.parseNullCoal();
                return new WeaveScriptParser.IfExpr(condition, consequent, alternate);
            }
            return condition;
        }

        /**
         * Parses the highest-level expression grammar.
         *
         * @returns {object} Expression AST node.
         */
        parseExpression() {
            if(this.peek() && this.peek().type === WeaveScriptLexer.TokenType.KW_IF) {
                return this.parseIfExpr();
            }
            return this.parseTernary();
        }

        /**
         * Parses `if ... then ... [else ...]`.
         *
         * @returns {WeaveScriptParser.IfExpr} Conditional expression node.
         */
        parseIfExpr() {
            this.advance();
            const condition = this.parseTernary();
            this.expect(WeaveScriptLexer.TokenType.KW_THEN);
            const consequent = this.parseStatement();
            let alternate = null;
            if(this.peek() && this.peek().type === WeaveScriptLexer.TokenType.KW_ELSE) {
                this.advance();
                alternate = this.parseStatement();
            }
            return new WeaveScriptParser.IfExpr(condition, consequent, alternate);
        }

        /**
         * Parses null-coalescing chains (`a ?? b ?? c`).
         *
         * @returns {object} AST node for the null-coalescing expression.
         */
        parseNullCoal() {
            let left = this.parseOr();
            while(this.peek() && this.peek().type === WeaveScriptLexer.TokenType.OP_NULLCOAL) {
                this.advance();
                const right = this.parseOr();
                left = new WeaveScriptParser.BinaryOp("??", left, right);
            }
            return left;
        }


        /**
         * Parses one or more expressions separated by logical OR operators.
         *
         * @returns {object} AST node representing the OR expression chain.
         */
        parseOr() {
            let left = this.parseAnd();
            while(this.peek() && [WeaveScriptLexer.TokenType.KW_OR, WeaveScriptLexer.TokenType.OP_OR].includes(this.peek().type)) {
                this.advance();
                const right = this.parseAnd();
                left = new WeaveScriptParser.BinaryOp("or", left, right);
            }
            return left;
        }

        /**
         * Parses one or more expressions separated by logical AND operators.
         *
         * @returns {object} AST node representing the AND expression chain.
         */
        parseAnd() {
            let left = this.parseNot();
            while(this.peek() && [WeaveScriptLexer.TokenType.KW_AND, WeaveScriptLexer.TokenType.OP_AND].includes(this.peek().type)) {
                this.advance();
                const right = this.parseNot();
                left = new WeaveScriptParser.BinaryOp("and", left, right);
            }
            return left;
        }

        /**
         * Parses unary NOT expressions.
         *
         * @returns {object} AST node for a NOT expression
         */
        parseNot() {
            if(this.peek() && [WeaveScriptLexer.TokenType.KW_NOT, WeaveScriptLexer.TokenType.OP_NOT].includes(this.peek().type)) {
                this.advance();
                return new WeaveScriptParser.UnaryOp("not", this.parseNot());
            }
            return this.parseComparison();
        }

        /**
         * Parses comparison operators and `is [not] blank` checks.
         *
         * @returns {object} AST node for a comparison/blank-check expression.
         */
        parseComparison() {
            const left = this.parseAddSub();

            if(this.peek() && this.peek().type === WeaveScriptLexer.TokenType.KW_IS) {
                this.advance();
                if(this.peek().type === WeaveScriptLexer.TokenType.KW_NOT) {
                    this.advance();
                    this.expect(WeaveScriptLexer.TokenType.KW_BLANK);
                    return new WeaveScriptParser.UnaryOp("is_not_blank", left);
                }
                this.expect(WeaveScriptLexer.TokenType.KW_BLANK);
                return new WeaveScriptParser.UnaryOp("is_blank", left);
            }

            if(this.peek() && this.peek().type === WeaveScriptLexer.TokenType.OP_CMP) {
                const op = this.advance().value;
                const right = this.parseAddSub();
                return new WeaveScriptParser.BinaryOp(op, left, right);
            }
            return left;
        }

        /**
         * Parses additive arithmetic (`+` and `-`) with left associativity.
         *
         * @returns {object} AST node for the additive expression.
         */
        parseAddSub() {
            let left = this.parseMulDiv();
            while(this.peek() && this.peek().type === WeaveScriptLexer.TokenType.OP_ARITH && ["+","-"].includes(this.peek().value)) {
                const op = this.advance().value;
                const right = this.parseMulDiv();
                left = new WeaveScriptParser.BinaryOp(op, left, right);
            }
            return left;
        }

        /**
         * Parses multiplicative arithmetic (`*`, `/`, `%`) with left associativity.
         *
         * @returns {object} AST node for the multiplicative expression.
         */
        parseMulDiv() {
            let left = this.parseFactor();
            while(this.peek() && this.peek().type === WeaveScriptLexer.TokenType.OP_ARITH && ["*", "/", "%"].includes(this.peek().value)) {
                const op = this.advance().value;
                const right = this.parseFactor();
                left = new WeaveScriptParser.BinaryOp(op, left, right);
            }
            return left;
        }

        /**
         * Parses a primitive factor: literal, variable reference, or parenthesized expression.
         *
         * @returns {object} AST node.
         * @throws {WeaveScriptParser.ParserError} If token is not a valid factor.
         */
        parseFactor() {
            const token = this.peek();
            if(!token) {
                throw new WeaveScriptParser.ParserError("Unexpected end of input");
            }
            switch(token.type) {
                case WeaveScriptLexer.TokenType.NUMBER:
                    this.advance();
                    return new WeaveScriptParser.NumberLiteral(token.value);
                case WeaveScriptLexer.TokenType.STRING:
                    this.advance();
                    return new WeaveScriptParser.StringLiteral(token.value);
                case WeaveScriptLexer.TokenType.BOOL:
                    this.advance();
                    return new WeaveScriptParser.BoolLiteral(token.value === "true");
                case WeaveScriptLexer.TokenType.NULL:
                    this.advance();
                    return new WeaveScriptParser.NullLiteral();
                case WeaveScriptLexer.TokenType.FUNC: {
                    const identifier = this.advance().value;
                    this.expect(WeaveScriptLexer.TokenType.LPAREN);
                    const args = [];
                    if(this.peek() && this.peek().type !== WeaveScriptLexer.TokenType.RPAREN) {
                        args.push(this.parseExpression());
                        while(this.peek() && this.peek().type === WeaveScriptLexer.TokenType.COMMA) {
                            this.advance();
                            args.push(this.parseExpression());
                        }
                    }
                    this.expect(WeaveScriptLexer.TokenType.RPAREN);
                    return new WeaveScriptParser.FunctionCall(identifier, args);
                }
                case WeaveScriptLexer.TokenType.IDENTIFIER:
                    this.advance();
                    return new WeaveScriptParser.VariableRef(token.value);
                case WeaveScriptLexer.TokenType.LPAREN: {
                    this.advance();
                    const expr = this.parseExpression();
                    this.expect(WeaveScriptLexer.TokenType.RPAREN);
                    return expr;
                }
                case WeaveScriptLexer.TokenType.STATE_VAR:
                    this.advance();
                    return new WeaveScriptParser.StateVarRef(token.value);
            }
            throw new WeaveScriptParser.ParserError(`Unexpected token: ${token.value}`);
        }
    }

    /**
     * Built-in function library for WeaveScript function-call expressions.
     *
     * Each function definition includes an argument count range (`min`/`max`) and an
     * implementation that receives evaluated argument values.
     */
    class Functions {
        /**
         * @param {{ isTruthy: (value: unknown) => boolean }} utils Utility helpers supplied by the evaluator.
         */
        constructor(utils) {
            this.utils = utils;
        }

        /**
         * Function definitions keyed by function name.
         *
         * @type {Readonly<Record<string, {min:number, max:number, fn:(args: unknown[]) => unknown}>>}
         */
        FUNCTION_DEFS = Object.freeze({
            round: {min: 1, max: 1, fn: (args) => Math.round(args[0])},
            floor: {min: 1, max: 1, fn: (args) => Math.floor(args[0])},
            ceil: {min: 1, max: 1, fn: (args) => Math.ceil(args[0])},
            abs: {min: 1, max: 1, fn: (args) => Math.abs(args[0])},
            min: {min: 2, max: Infinity, fn: (args) => Math.min(...args)},
            max: {min: 2, max: Infinity, fn: (args) => Math.max(...args)},
            clamp: {min: 3, max: 3, fn: (args) => Math.max(Math.min(args[0], args[2]), args[1])},
            random: {min: 0, max: 1, fn: (args) => Math.floor(Math.random() * (args[0] ?? 100))},

            toUpper: {min: 1, max: 1, fn: (args) => String(args[0]).toUpperCase()},
            toLower: {min: 1, max: 1, fn: (args) => String(args[0]).toLowerCase()},
            trim: {min: 1, max: 1, fn: (args) => String(args[0]).trim()},
            length: {min: 1, max: 1, fn: (args) => String(args[0]).length},
            substring: {min: 2, max: 3, fn: (args) => String(args[0]).substring(args[1], args[2])},
            replace: {min: 3, max: 3, fn: (args) => String(args[0]).replace(args[1], args[2])},

            toNumber: {min: 1, max: 1, fn: (args) => Number(args[0])},
            toString: {min: 1, max: 1, fn: (args) => String(args[0])},
            toBoolean: {min: 1, max: 1, fn: (args) => this.utils.isTruthy(args[0])},

            isNumber: {min: 1, max: 1, fn: (args) => typeof args[0] === "number"},
            isString: {min: 1, max: 1, fn: (args) => typeof args[0] === "string"},
            isBoolean: {min: 1, max: 1, fn: (args) => typeof args[0] === "boolean"},
        });
    }

    /**
     * Evaluates WeaveScript AST nodes and renders script blocks to text.
     */
    class WeaveScriptEvaluator {
        /**
         * Evaluator-specific runtime error.
         *
         * @param {string} message Error details.
         */
        static EvalError = class extends Error {
            constructor(message) {
                super(message);
                this.name = "Evaluator Error";
            }
        }

        /**
         * Appends the raw `#{...}` block source to an error message (once) to make
         * debugging user prompts easier.
         *
         * @param {unknown} error Error thrown while parsing/evaluating a block.
         * @param {WeaveScriptLexer.TokenList & {rawBlock?: string, blockSrc?: string}} tokenList Token list carrying block metadata.
         * @returns {unknown} The same error object (possibly mutated) for rethrowing.
         */
        static appendBlockContext(error, tokenList) {
            if (!error || typeof error !== "object") return error;
            if (error.__weaveBlockContextAdded) return error;
            if (!tokenList || typeof tokenList !== "object") return error;
            const raw = tokenList.rawBlock ?? (typeof tokenList.blockSrc === "string" ? `#{${tokenList.blockSrc}}` : null);
            if (typeof raw !== "string") return error;

            const suffix = `\n\nIn block:\n${raw}`;
            if (typeof error.message === "string" && !error.message.includes("\n\nIn block:\n")) {
                error.message += suffix;
            }
            error.__weaveBlockContextAdded = true;
            return error;
        }
        /**
         * Converts script values to truthiness used by conditionals.
         *
         * @param {unknown} value Value to evaluate.
         * @returns {boolean} Truthy status under WeaveScript rules.
         */
        static isTruthy(value) {
            if(value === WeaveScriptEvaluator.NULL) {
                return false;
            } else if(typeof(value) === "boolean") {
                return value;
            } else if (typeof(value) === "number") {
                return value != 0;
            } else if (typeof(value) === "string") {
                return value != "";
            }
            return false;
        }

        /**
         * Checks if both operands are numbers.
         *
         * @param {unknown} a Left value.
         * @param {unknown} b Right value.
         * @returns {boolean} True when both values are numeric.
         */
        static isNumber(a,b) {
            return typeof(a) === "number" && typeof(b) === "number"
        }

        /**
         * Sentinel value used to represent `null`/`undefined` in WeaveScript.
         *
         * This converts to an empty string
         */
        static NULL = Object.freeze({
            toString() { return ""; }
        });

        /**
         * Creates a new evaluator with a fresh local variable environment.
         */
        constructor() {
            this.env = {};
        }

        /**
         * Recursively evaluates an AST node.
         *
         * @param {object} node AST node from `WeaveScriptParser`.
         * @returns {string|number|boolean|null} Evaluated result.
         * @throws {WeaveScriptEvaluator.EvalError} On runtime errors.
         */
        evaluate(node) {
            if(node instanceof WeaveScriptParser.Block) {
                let result = "";
                for(const statement of node.statements) {
                    const value = this.evaluate(statement);
                    if(value !== null) {
                        result = value;
                    }
                }
                return result;
            } else if(node instanceof WeaveScriptParser.VarDecl) {
                this.env[node.identifier] = this.evaluate(node.value);
                return null;
            } else if(node instanceof WeaveScriptParser.IfExpr) {
                const cond = this.evaluate(node.condition);
                if(WeaveScriptEvaluator.isTruthy(cond)) {
                    return this.evaluate(node.consequent);
                } else if (node.alternate != null) {
                    return this.evaluate(node.alternate);
                } else {
                    return "";
                }
            } else if(node instanceof WeaveScriptParser.BinaryOp) {
                const left = this.evaluate(node.left);
                switch(node.operator) {
                    case "and": return WeaveScriptEvaluator.isTruthy(left) && WeaveScriptEvaluator.isTruthy(this.evaluate(node.right));
                    case "or": return WeaveScriptEvaluator.isTruthy(left) || WeaveScriptEvaluator.isTruthy(this.evaluate(node.right));
                    case "??": return left === WeaveScriptEvaluator.NULL ? this.evaluate(node.right) : left;
                }
                const right = this.evaluate(node.right);
                switch(node.operator) {
                    case "+":
                        return WeaveScriptEvaluator.isNumber(left, right) ? left + right : String(left) + String(right);
                    case "-": return left - right;
                    case "*": return left * right;
                    case "/":
                        if(right === 0) {
                            throw new WeaveScriptEvaluator.EvalError("Division by zero");
                        }
                        return left / right;
                    case "%": 
                        if(right === 0) {
                            throw new WeaveScriptEvaluator.EvalError("Modulo by zero");
                        }
                        return left % right;
                    case "==": return left === right;
                    case "!=": return left !== right;
                    case "<": return left < right;
                    case ">": return left > right;
                    case "<=": return left <= right;
                    case ">=": return left >= right;
                    default: throw new WeaveScriptEvaluator.EvalError(`Unknown operator: ${node.operator}`);
                }
            } else if (node instanceof WeaveScriptParser.UnaryOp) {
                const value = this.evaluate(node.operand);
                switch(node.operator) {
                    case "not": return !WeaveScriptEvaluator.isTruthy(value);
                    case "is_blank": return typeof(value) === "string" && value.trim() === "";
                    case "is_not_blank": return typeof(value) === "string" && value.trim() !== "";
                }
            } else if (node instanceof WeaveScriptParser.NumberLiteral) {
                return Number(node.value);
            } else if (node instanceof WeaveScriptParser.StringLiteral) {
                return node.value
                    .slice(1,-1)
                    .replace(/\\"/g, '"')
                    .replace(/\\'/g, "'")
                    .replace(/\\\\/g, '\\');
            } else if (node instanceof WeaveScriptParser.BoolLiteral) {
                return node.value;
            } else if (node instanceof WeaveScriptParser.NullLiteral) {
                return WeaveScriptEvaluator.NULL;
            } else if (node instanceof WeaveScriptParser.VariableRef) {
                if(!Object.hasOwn(this.env, node.identifier)) {
                    throw new WeaveScriptEvaluator.EvalError(`Undefined variable: ${node.identifier}`);
                }
                return this.env[node.identifier];
            } else if(node instanceof WeaveScriptParser.StateVarAssign) {
                const identifier = node.identifier.slice(1);
                state[identifier] = this.evaluate(node.value);
                return null;
            } else if (node instanceof WeaveScriptParser.StateVarRef) {
                const identifier = node.identifier.slice(1);
                if(!Object.hasOwn(state, identifier)) {
                    return WeaveScriptEvaluator.NULL;
                }
                return state[identifier];
            } else if (node instanceof WeaveScriptParser.FunctionCall) {
                const functions = new Functions({isTruthy: WeaveScriptEvaluator.isTruthy});
                const def = functions.FUNCTION_DEFS[node.identifier];
                if(!def)  {
                    throw new WeaveScriptEvaluator.EvalError(`Unknown function: ${node.identifier}`);
                }
                const args = node.args.map(arg => this.evaluate(arg));
                if(args.length < def.min || args.length > def.max) {
                    const expected = def.min === def.max ? `${def.min}` : def.max === Infinity ? `${def.min} or more` : `${def.min}-${def.max}`;
                    
                
                    const arguentString = expected === "1" ? "argument" : "arguments";

                    throw new WeaveScriptEvaluator.EvalError(
                        `${node.identifier}() expected ${expected} ${arguentString}, got ${args.length}`
                    );
                }
                return def.fn(args);
            } else {
                throw new WeaveScriptEvaluator.EvalError(`Unknown node type: ${node?.constructor?.name ?? node}`);
            }
        }

        /**
         * Evaluates all WeaveScript blocks in a text prompt and returns rendered text.
         *
         * @param {string} promptText Text containing plain content and `#{...}` blocks.
         * @returns {string} Final rendered output.
         */
        static runScript(promptText) {
            const evaluator = new WeaveScriptEvaluator();
            let segments;
            try {
                segments = WeaveScriptLexer.tokenize(promptText);
            } catch (err) {
                err.message += `\n\nIn block:\n${err.src}`;
                throw err;
            }

            const output = [];

            for(const segment of segments) {
                if(segment instanceof WeaveScriptLexer.PlainText) {
                    output.push(segment.text);
                } else if(segment instanceof WeaveScriptLexer.TokenList) {
                    try {
                        const parser = new WeaveScriptParser(segment);
                        const ast = parser.parseBlock();
                        const result = evaluator.evaluate(ast);
                        output.push(String(result));
                    } catch (err) {
                        throw WeaveScriptEvaluator.appendBlockContext(err, segment);
                    }
                }
            }
            return output.join("");
        }

        
    }

    /**
     * @typedef {object} StoryCard
     * @property {number} id A unique numerical id for the story card
     * @property {Date} createdAt The date and time the story card was created
     * @property {Date} updatedAt The date and time the story card was last updated
     * @property {string} keys Comma-separated keys that should cause the story card to be included in the model context
     * @property {string} entry The text that should be included in the model context if the story card is included
     * @property {string} type A text field that can be used to separate story cards into categories
     * @property {string} title The title of the story card
     * @property {string} description Story card description/notes
     * @property {boolean} useForCharacterCreation Whether the story card should be used in the character creator
     * @property {number} [index] Optional explicit index (fallbacks to iteration index)
     * @property {Set<string>} [tags] Optional. The same as keys, but as a Set
     */

    /**
     * Runs WeaveScript initialization for the main scenario sections.
     * Evaluates Plot Essentials, Author's Note, and then updates story cards.
     *
     * @returns {void}
     */
    function init() {
        const plotEssentials = state.memory.context;
        const authorsNote = state.memory.authorsNote;
        state.memory.context = WeaveScriptEvaluator.runScript(plotEssentials);
        state.memory.authorsNote = WeaveScriptEvaluator.runScript(authorsNote);
        this.updateStoryCards(storyCards);
    }

    /**
     * Rewrites story card entries that opt in to WeaveScript with
     * `#{EnableWeaveScript: true}` at the start of their description.
     *
     * For each opted-in card, the portion of `description` after the marker is
     * evaluated as WeaveScript and wrapped in `#{...}`. If the card `entry` already
     * contains a `#{...}` block, the first one is replaced; otherwise the new block
     * is appended to the end of the entry.
     *
     * @param {StoryCard[]} storyCards Story cards to scan/update.
     * @returns {void}
     */
    function updateStoryCards(storyCards) {
        
        /** @type {string} Story card marker that enables WeaveScript processing. */
        const ENABLE_ON_STORYCARD = '#{EnableWeaveScript: true}';
        /** @type {string} Opening delimiter for generated story card script content. */
        const STORYCARD_START = "#{";
        /** @type {string} Closing delimiter for generated story card script content. */
        const STORYCARD_END = "}";
        /** @type {RegExp} Matches the first script block in a story card entry. */
        const STORYCARD_REGEX = /#{.*}/s;

        for(const [index, storyCard] of storyCards.entries()) {
            let description = storyCard.description;
            if(description.startsWith(ENABLE_ON_STORYCARD)) {
                description = description.slice(ENABLE_ON_STORYCARD.length);
                const update = `${STORYCARD_START}${WeaveScriptEvaluator.runScript(description)}${STORYCARD_END}`;
                let newEntry = storyCard.entry;
                if(STORYCARD_REGEX.test(storyCard.entry)) {
                    newEntry = storyCard.entry.replace(STORYCARD_REGEX, update);
                } else {
                    newEntry = storyCard.entry + update;
                }
                updateStoryCard(storyCard?.index ?? index, storyCard.keys, newEntry, storyCard.type);
            }
        }
    }

    /**
     * Updates only the story cards whose tags are mentioned in `text`.
     *
     * Tags are extracted from each story card's `keys` (comma-separated list),
     * then `text` is scanned for any of those tags. Any card with at least one
     * matched tag is passed to `updateStoryCards`.
     *
     * @param {string} text The text to scan for story card tags.
     * @returns {void}
     */
    function updateTriggeredStoryCards(text) {
        const splitTags = storyCards.map((card,i) => ({...card, index: i, tags: card.keys.split(',')}));
        const allTags = [...new Set(splitTags.flatMap(card => card.tags))];
        const regex = new RegExp(allTags.map( s=> s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
        const matched = new Set(text.match(regex) || []);
        const triggered = splitTags.filter(card => card.tags.some(tag => matched.has(tag)));
        updateStoryCards(triggered);
    }

    exports.init = init;
    exports.updateStoryCards = updateStoryCards;
    exports.updateTriggeredStoryCards = updateTriggeredStoryCards;

    return exports;

})({});
