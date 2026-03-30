import { WeaveScriptLexer } from "./lexer.js";

/**
 * Recursive-descent parser for WeaveScript token streams.
 */
export class WeaveScriptParser {
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
