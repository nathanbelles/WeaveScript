import { WeaveScriptParser } from "./parser.js";
import { WeaveScriptLexer } from "./lexer.js";
import { Functions } from './funtions.js';

/**
 * Evaluates WeaveScript AST nodes and renders script blocks to text.
 */
export class WeaveScriptEvaluator {
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
