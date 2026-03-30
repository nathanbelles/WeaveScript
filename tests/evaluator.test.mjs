import { beforeEach, describe, expect, it, vi } from "vitest";

// Evaluator unit tests should not depend on real lexing/parsing.
// We mock both modules and feed deterministic ASTs into the evaluator.
const mocked = vi.hoisted(() => {
  return {
    segments: /** @type {any[]} */ ([]),
    astByTokenList: /** @type {Map<any, any>} */ (new Map()),
  };
});

const builtins = vi.hoisted(() => {
  return {
    oneExactFn: vi.fn(() => "ONE_EXACT_RET"),
    infiniteFn: vi.fn(() => "INFINITE_RET"),
    twoExactFn: vi.fn(() => "TWOEXACT_RET"),
    range2to3Fn: vi.fn(() => "RANGE_RET"),
  };
});

vi.mock("../lexer.js", () => {
  class PlainText {
    constructor(text) {
      this.text = text;
    }
  }
  class TokenList extends Array {}

  return {
    WeaveScriptLexer: {
      PlainText,
      TokenList,
      tokenize: vi.fn(() => mocked.segments),
    },
  };
});

vi.mock("../funtions.js", () => {
  class Functions {
    constructor(utils) {
      void utils;
      this.FUNCTION_DEFS = Object.freeze({
        oneExact: { min: 1, max: 1, fn: builtins.oneExactFn },
        infinite: { min: 2, max: Infinity, fn: builtins.infiniteFn },
        twoExact: { min: 2, max: 2, fn: builtins.twoExactFn },
        range2to3: { min: 2, max: 3, fn: builtins.range2to3Fn },
      });
    }
  }
  return { Functions };
});

vi.mock("../parser.js", () => {
  class Block {
    constructor(statements) {
      this.statements = statements;
    }
  }
  class VarDecl {
    constructor(identifier, value) {
      this.identifier = identifier;
      this.value = value;
    }
  }
  class IfExpr {
    constructor(condition, consequent, alternate) {
      this.condition = condition;
      this.consequent = consequent;
      this.alternate = alternate;
    }
  }
  class BinaryOp {
    constructor(operator, left, right) {
      this.operator = operator;
      this.left = left;
      this.right = right;
    }
  }
  class UnaryOp {
    constructor(operator, operand) {
      this.operator = operator;
      this.operand = operand;
    }
  }
  class NumberLiteral {
    constructor(value) {
      this.value = value;
    }
  }
  class StringLiteral {
    constructor(value) {
      this.value = value;
    }
  }
  class BoolLiteral {
    constructor(value) {
      this.value = value;
    }
  }
  class NullLiteral {
    constructor() {}
  }
  class VariableRef {
    constructor(identifier) {
      this.identifier = identifier;
    }
  }
  class StateVarAssign {
    constructor(identifier, value) {
      this.identifier = identifier;
      this.value = value;
    }
  }
  class StateVarRef {
    constructor(identifier) {
      this.identifier = identifier;
    }
  }
  class FunctionCall {
    constructor(identifier, args) {
      this.identifier = identifier;
      this.args = args;
    }
  }

  class WeaveScriptParser {
    constructor(tokens) {
      this.tokens = tokens;
    }
    parseBlock() {
      if (!mocked.astByTokenList.has(this.tokens)) {
        throw new Error("Test misconfigured: no AST registered for TokenList");
      }
      return mocked.astByTokenList.get(this.tokens);
    }
  }

  // Mirror evaluator.js' instanceof checks (it imports { WeaveScriptParser }).
  WeaveScriptParser.Block = Block;
  WeaveScriptParser.VarDecl = VarDecl;
  WeaveScriptParser.IfExpr = IfExpr;
  WeaveScriptParser.BinaryOp = BinaryOp;
  WeaveScriptParser.UnaryOp = UnaryOp;
  WeaveScriptParser.NumberLiteral = NumberLiteral;
  WeaveScriptParser.StringLiteral = StringLiteral;
  WeaveScriptParser.BoolLiteral = BoolLiteral;
  WeaveScriptParser.NullLiteral = NullLiteral;
  WeaveScriptParser.VariableRef = VariableRef;
  WeaveScriptParser.StateVarAssign = StateVarAssign;
  WeaveScriptParser.StateVarRef = StateVarRef;
  WeaveScriptParser.FunctionCall = FunctionCall;

  return { WeaveScriptParser };
});

import { WeaveScriptLexer } from "../lexer.js";
import { WeaveScriptParser } from "../parser.js";
import { WeaveScriptEvaluator } from "../evaluator.js";

describe("WeaveScriptEvaluator.runScript", () => {
  beforeEach(() => {
    mocked.segments.length = 0;
    mocked.astByTokenList.clear();
    WeaveScriptLexer.tokenize.mockClear();
  });

  function tokenBlock(ast) {
    const tokens = new WeaveScriptLexer.TokenList();
    mocked.astByTokenList.set(tokens, ast);
    return tokens;
  }

  function runSingleExpression(exprAst) {
    mocked.segments.length = 0;
    mocked.astByTokenList.clear();
    mocked.segments.push(
      tokenBlock(new WeaveScriptParser.Block([exprAst])),
    );
    return WeaveScriptEvaluator.runScript("ignored by mock");
  }

  it("evaluates arithmetic blocks within text", () => {
    mocked.segments.push(
      new WeaveScriptLexer.PlainText("Score: "),
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "+",
            new WeaveScriptParser.NumberLiteral("1"),
            new WeaveScriptParser.BinaryOp(
              "*",
              new WeaveScriptParser.NumberLiteral("2"),
              new WeaveScriptParser.NumberLiteral("3"),
            ),
          ),
        ]),
      ),
    );

    const output = WeaveScriptEvaluator.runScript("ignored by mock");
    expect(output).toBe("Score: 7");
  });

  it("supports variable declaration and reuse across blocks", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.VarDecl(
            "Age",
            new WeaveScriptParser.NumberLiteral("19"),
          ),
        ]),
      ),
      new WeaveScriptLexer.PlainText("Age: "),
      tokenBlock(
        new WeaveScriptParser.Block([new WeaveScriptParser.VariableRef("Age")]),
      ),
    );

    const output = WeaveScriptEvaluator.runScript("ignored by mock");
    expect(output).toBe("Age: 19");
  });

  it("handles conditionals and blank checks", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.VarDecl(
            "Name",
            new WeaveScriptParser.StringLiteral('" "'),
          ),
          new WeaveScriptParser.IfExpr(
            new WeaveScriptParser.UnaryOp(
              "is_blank",
              new WeaveScriptParser.VariableRef("Name"),
            ),
            new WeaveScriptParser.StringLiteral('"Unknown"'),
            new WeaveScriptParser.VariableRef("Name"),
          ),
        ]),
      ),
    );

    const output = WeaveScriptEvaluator.runScript("ignored by mock");
    expect(output).toBe("Unknown");
  });

  it("joins strings with non-string values", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "+",
            new WeaveScriptParser.StringLiteral('"Age: "'),
            new WeaveScriptParser.NumberLiteral("19"),
          ),
        ]),
      ),
    );

    const output = WeaveScriptEvaluator.runScript("ignored by mock");
    expect(output).toBe("Age: 19");
  });

  it("throws on undefined variable usage", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.VariableRef("MissingVar"),
        ]),
      ),
    );

    expect(() => WeaveScriptEvaluator.runScript("ignored by mock")).toThrow(
      /Undefined variable: MissingVar/,
    );
  });

  it("throws on division by zero", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "/",
            new WeaveScriptParser.NumberLiteral("10"),
            new WeaveScriptParser.NumberLiteral("0"),
          ),
        ]),
      ),
    );

    expect(() => WeaveScriptEvaluator.runScript("ignored by mock")).toThrow(
      /Division by zero/,
    );
  });

  it("unary not uses WeaveScript truthiness rules", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          // not 0  => true (0 is falsey by WeaveScript rules)
          new WeaveScriptParser.UnaryOp(
            "not",
            new WeaveScriptParser.NumberLiteral("0"),
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("true");
  });

  it("is_not_blank works and string escapes are unescaped", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.VarDecl(
            "S",
            // includes escaped double-quote, single-quote, and backslash
            new WeaveScriptParser.StringLiteral('"a\\\\b \\"x\\" \\\'y\\\'"'),
          ),
          new WeaveScriptParser.UnaryOp(
            "is_not_blank",
            new WeaveScriptParser.VariableRef("S"),
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("true");
  });

  it("throws on modulo by zero", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "%",
            new WeaveScriptParser.NumberLiteral("10"),
            new WeaveScriptParser.NumberLiteral("0"),
          ),
        ]),
      ),
    );

    expect(() => WeaveScriptEvaluator.runScript("ignored by mock")).toThrow(
      /Modulo by zero/,
    );
  });

  it("returns an EvalError object for unknown binary operators", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "**",
            new WeaveScriptParser.NumberLiteral("2"),
            new WeaveScriptParser.NumberLiteral("3"),
          ),
        ]),
      ),
    );

    expect(() => WeaveScriptEvaluator.runScript("ignored by mock")).toThrow(
        /Unknown operator: \*\*/,
    );
  });

  it("state variable assignment hits current runtime path", () => {
    globalThis.state = {};
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.StateVarAssign(
            "$gold",
            new WeaveScriptParser.NumberLiteral("5"),
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("");
    expect(globalThis.state.gold).toBe(5);

    delete globalThis.state;
  });

  it("throws on unknown node types", () => {
    class WeirdNode {}
    mocked.segments.push(tokenBlock(new WeirdNode()));

    expect(() => WeaveScriptEvaluator.runScript("ignored by mock")).toThrow(
      /Unknown node type: WeirdNode/,
    );
  });

  it("null literal evaluates to empty output", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([new WeaveScriptParser.NullLiteral()]),
      ),
    );
    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("");
  });

  it("== works for NULL-valued variables", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.VarDecl("X", new WeaveScriptParser.NullLiteral()),
          new WeaveScriptParser.BinaryOp(
            "==",
            new WeaveScriptParser.VariableRef("X"),
            new WeaveScriptParser.NullLiteral(),
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("true");
  });

  it("!= works for NULL-valued variables", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.VarDecl("X", new WeaveScriptParser.NullLiteral()),
          new WeaveScriptParser.BinaryOp(
            "!=",
            new WeaveScriptParser.VariableRef("X"),
            new WeaveScriptParser.NullLiteral(),
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("false");
  });

  it("?? returns right operand when left is NULL", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "??",
            new WeaveScriptParser.NullLiteral(),
            new WeaveScriptParser.NumberLiteral("9"),
          ),
        ]),
      ),
    );
    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("9");
  });

  it("?? returns left operand when left is not NULL", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "??",
            new WeaveScriptParser.NumberLiteral("2"),
            new WeaveScriptParser.NumberLiteral("9"),
          ),
        ]),
      ),
    );
    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("2");
  });

  it("?? does not evaluate right when left is not NULL", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "??",
            new WeaveScriptParser.NumberLiteral("1"),
            new WeaveScriptParser.VariableRef("ShouldNotRead"),
          ),
        ]),
      ),
    );
    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("1");
  });

  it("and does not evaluate right when left is falsey", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "and",
            new WeaveScriptParser.BoolLiteral(false),
            new WeaveScriptParser.VariableRef("ShouldNotRead"),
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("false");
  });

  it("or does not evaluate right when left is truthy", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "or",
            new WeaveScriptParser.BoolLiteral(true),
            new WeaveScriptParser.VariableRef("ShouldNotRead"),
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("true");
  });

  it("and evaluates right when left is truthy", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "and",
            new WeaveScriptParser.BoolLiteral(true),
            new WeaveScriptParser.VariableRef("ShouldReadAndFail"),
          ),
        ]),
      ),
    );

    expect(() => WeaveScriptEvaluator.runScript("ignored by mock")).toThrow(
      /Undefined variable: ShouldReadAndFail/,
    );
  });

  it("or evaluates right when left is falsey", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "or",
            new WeaveScriptParser.BoolLiteral(false),
            new WeaveScriptParser.VariableRef("ShouldReadAndFail"),
          ),
        ]),
      ),
    );

    expect(() => WeaveScriptEvaluator.runScript("ignored by mock")).toThrow(
      /Undefined variable: ShouldReadAndFail/,
    );
  });

  it("ignores unknown segment types in runScript", () => {
    mocked.segments.push(
      new WeaveScriptLexer.PlainText("A"),
      // Neither PlainText nor TokenList
      { kind: "mystery" },
      new WeaveScriptLexer.PlainText("B"),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("AB");
  });

  it("includes block context for lexer errors", () => {
    WeaveScriptLexer.tokenize.mockImplementationOnce(() => {
      const err = new Error("Unclosed #{ block");
      err.src = "#{1 + 2";
      throw err;
    });

    try {
      WeaveScriptEvaluator.runScript("ignored by mock");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toMatch(/Unclosed #\{ block/);
      expect(err.message).toMatch(/In block:\n#\{1 \+ 2/);
    }
  });

  it("unknown node type message handles null nodes", () => {
    mocked.segments.push(tokenBlock(null));

    expect(() => WeaveScriptEvaluator.runScript("ignored by mock")).toThrow(
      /Unknown node type: null/,
    );
  });

  it("evaluates subtraction", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "-",
            new WeaveScriptParser.NumberLiteral("10"),
            new WeaveScriptParser.NumberLiteral("3"),
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("7");
  });

  it("evaluates multiplication", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "*",
            new WeaveScriptParser.NumberLiteral("2"),
            new WeaveScriptParser.NumberLiteral("4"),
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("8");
  });

  it("evaluates modulo (non-zero divisor)", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "%",
            new WeaveScriptParser.NumberLiteral("10"),
            new WeaveScriptParser.NumberLiteral("3"),
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("1");
  });

  it("evaluates equality comparisons (==)", () => {
    expect(
      runSingleExpression(
        new WeaveScriptParser.BinaryOp(
          "==",
          new WeaveScriptParser.NumberLiteral("1"),
          new WeaveScriptParser.NumberLiteral("1"),
        ),
      ),
    ).toBe("true");
  });

  it("evaluates inequality comparisons (!=)", () => {
    expect(
      runSingleExpression(
        new WeaveScriptParser.BinaryOp(
          "!=",
          new WeaveScriptParser.NumberLiteral("1"),
          new WeaveScriptParser.NumberLiteral("2"),
        ),
      ),
    ).toBe("true");
  });

  it("evaluates less-than comparisons (<)", () => {
    expect(
      runSingleExpression(
        new WeaveScriptParser.BinaryOp(
          "<",
          new WeaveScriptParser.NumberLiteral("1"),
          new WeaveScriptParser.NumberLiteral("2"),
        ),
      ),
    ).toBe("true");
  });

  it("evaluates greater-than comparisons (>)", () => {
    expect(
      runSingleExpression(
        new WeaveScriptParser.BinaryOp(
          ">",
          new WeaveScriptParser.NumberLiteral("2"),
          new WeaveScriptParser.NumberLiteral("1"),
        ),
      ),
    ).toBe("true");
  });

  it("evaluates less-than-or-equal comparisons (<=)", () => {
    expect(
      runSingleExpression(
        new WeaveScriptParser.BinaryOp(
          "<=",
          new WeaveScriptParser.NumberLiteral("2"),
          new WeaveScriptParser.NumberLiteral("2"),
        ),
      ),
    ).toBe("true");
  });

  it("evaluates greater-than-or-equal comparisons (>=)", () => {
    expect(
      runSingleExpression(
        new WeaveScriptParser.BinaryOp(
          ">=",
          new WeaveScriptParser.NumberLiteral("2"),
          new WeaveScriptParser.NumberLiteral("2"),
        ),
      ),
    ).toBe("true");
  });

  it("evaluates logical and using WeaveScript truthiness", () => {
    expect(
        runSingleExpression(
          new WeaveScriptParser.BinaryOp(
            "and",
            new WeaveScriptParser.BoolLiteral(true),
            new WeaveScriptParser.BoolLiteral(true),
          ),
        ),
      ).toBe("true");
    expect(
      runSingleExpression(
        new WeaveScriptParser.BinaryOp(
          "and",
          new WeaveScriptParser.BoolLiteral(true),
          new WeaveScriptParser.BoolLiteral(false),
        ),
      ),
    ).toBe("false");
      expect(
        runSingleExpression(
          new WeaveScriptParser.BinaryOp(
            "and",
            new WeaveScriptParser.BoolLiteral(false),
            new WeaveScriptParser.BoolLiteral(true),
          ),
        ),
      ).toBe("false");
      expect(
        runSingleExpression(
          new WeaveScriptParser.BinaryOp(
            "and",
            new WeaveScriptParser.BoolLiteral(false),
            new WeaveScriptParser.BoolLiteral(false),
          ),
        ),
      ).toBe("false");
    
  });

  it("evaluates logical or using WeaveScript truthiness", () => {
    expect(
        runSingleExpression(
          new WeaveScriptParser.BinaryOp(
            "or",
            new WeaveScriptParser.BoolLiteral(true),
            new WeaveScriptParser.BoolLiteral(true),
          ),
        ),
      ).toBe("true");
    expect(
      runSingleExpression(
        new WeaveScriptParser.BinaryOp(
          "or",
          new WeaveScriptParser.BoolLiteral(false),
          new WeaveScriptParser.BoolLiteral(true),
        ),
      ),
    ).toBe("true");
    expect(
        runSingleExpression(
          new WeaveScriptParser.BinaryOp(
            "or",
            new WeaveScriptParser.BoolLiteral(true),
            new WeaveScriptParser.BoolLiteral(false),
          ),
        ),
      ).toBe("true");
      expect(
        runSingleExpression(
          new WeaveScriptParser.BinaryOp(
            "or",
            new WeaveScriptParser.BoolLiteral(false),
            new WeaveScriptParser.BoolLiteral(false),
          ),
        ),
      ).toBe("false");
  });

  it("evaluates state variable references", () => {
    globalThis.state = { gold: 123 };

    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([new WeaveScriptParser.StateVarRef("$gold")]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("123");

    delete globalThis.state;
  });

  it("covers isTruthy() for non-primitive values", () => {
    expect(WeaveScriptEvaluator.isTruthy({})).toBe(false);
    expect(WeaveScriptEvaluator.isTruthy(null)).toBe(false);
  });

  it("covers isTruthy() for NULL sentinel", () => {
    expect(WeaveScriptEvaluator.isTruthy(WeaveScriptEvaluator.NULL)).toBe(false);
  });

  it("covers isTruthy() for strings", () => {
    expect(WeaveScriptEvaluator.isTruthy("")).toBe(false);
    expect(WeaveScriptEvaluator.isTruthy("x")).toBe(true);
    expect(WeaveScriptEvaluator.isTruthy(" ")).toBe(true);
  });

  it("if-expression with false condition and no else returns empty string", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.IfExpr(
            new WeaveScriptParser.BoolLiteral(false),
            new WeaveScriptParser.StringLiteral('"yes"'),
            null,
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("");
  });

  it("if-expression with false condition evaluates else branch", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.IfExpr(
            new WeaveScriptParser.BoolLiteral(false),
            new WeaveScriptParser.StringLiteral('"yes"'),
            new WeaveScriptParser.StringLiteral('"no"'),
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("no");
  });

  it("evaluates built-in function calls", () => {
    builtins.oneExactFn.mockClear();
    expect(
      runSingleExpression(
        new WeaveScriptParser.FunctionCall("oneExact", [
          new WeaveScriptParser.NumberLiteral("2.7"),
        ]),
      ),
    ).toBe("ONE_EXACT_RET");
    expect(builtins.oneExactFn).toHaveBeenCalledTimes(1);
    expect(builtins.oneExactFn).toHaveBeenCalledWith([2.7]);
  });

  it("throws on unknown function name", () => {
    expect(() =>
      runSingleExpression(
        new WeaveScriptParser.FunctionCall("notABuiltin", []),
      ),
    ).toThrow(/Unknown function: notABuiltin/);
  });

  it("throws when argument count does not match builtin signature", () => {
    expect(() =>
      runSingleExpression(
        new WeaveScriptParser.FunctionCall("oneExact", []),
      ),
    ).toThrow(/oneExact\(\) expected 1 argument/);

    expect(() =>
      runSingleExpression(
        new WeaveScriptParser.FunctionCall("oneExact", [
          new WeaveScriptParser.NumberLiteral("1"),
          new WeaveScriptParser.NumberLiteral("2"),
        ]),
      ),
    ).toThrow(/oneExact\(\) expected 1 argument/);
  });

  it("formats arity errors for exact-2, range, and variadic signatures", () => {
    // min === max and not 1 => "2 arguments"
    expect(() =>
      runSingleExpression(
        new WeaveScriptParser.FunctionCall("twoExact", [
          new WeaveScriptParser.NumberLiteral("1"),
        ]),
      ),
    ).toThrow(/twoExact\(\) expected 2 arguments, got 1/);

    // min-max range => "2-3 arguments"
    expect(() =>
      runSingleExpression(
        new WeaveScriptParser.FunctionCall("range2to3", [
          new WeaveScriptParser.NumberLiteral("1"),
        ]),
      ),
    ).toThrow(/range2to3\(\) expected 2-3 arguments, got 1/);

    // max === Infinity => "2 or more arguments"
    expect(() =>
      runSingleExpression(
        new WeaveScriptParser.FunctionCall("infinite", [
          new WeaveScriptParser.NumberLiteral("1"),
        ]),
      ),
    ).toThrow(/infinite\(\) expected 2 or more arguments, got 1/);
  });

  it("allows variadic builtins with two or more arguments", () => {
    builtins.infiniteFn.mockClear();
    expect(
      runSingleExpression(
        new WeaveScriptParser.FunctionCall("infinite", [
          new WeaveScriptParser.NumberLiteral("1"),
          new WeaveScriptParser.NumberLiteral("5"),
          new WeaveScriptParser.NumberLiteral("3"),
        ]),
      ),
    ).toBe("INFINITE_RET");
    expect(builtins.infiniteFn).toHaveBeenCalledTimes(1);
    expect(builtins.infiniteFn).toHaveBeenCalledWith([1, 5, 3]);
  });

  it("division works for non-zero divisors", () => {
    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([
          new WeaveScriptParser.BinaryOp(
            "/",
            new WeaveScriptParser.NumberLiteral("10"),
            new WeaveScriptParser.NumberLiteral("2"),
          ),
        ]),
      ),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("5");
  });

  it("missing state variable references evaluate to empty output", () => {
    globalThis.state = {};
    try {
      mocked.segments.push(
        tokenBlock(
          new WeaveScriptParser.Block([
            new WeaveScriptParser.StateVarRef("$gold"),
          ]),
        ),
      );

      expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("");
    } finally {
      delete globalThis.state;
    }
  });
});
