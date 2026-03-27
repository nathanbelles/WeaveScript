import { beforeEach, describe, expect, it, vi } from "vitest";

// Evaluator unit tests should not depend on real lexing/parsing.
// We mock both modules and feed deterministic ASTs into the evaluator.
const mocked = vi.hoisted(() => {
  return {
    segments: /** @type {any[]} */ ([]),
    astByTokenList: /** @type {Map<any, any>} */ (new Map()),
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
  WeaveScriptParser.VariableRef = VariableRef;
  WeaveScriptParser.StateVarAssign = StateVarAssign;
  WeaveScriptParser.StateVarRef = StateVarRef;

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

  it("ignores unknown segment types in runScript", () => {
    mocked.segments.push(
      new WeaveScriptLexer.PlainText("A"),
      // Neither PlainText nor TokenList
      { kind: "mystery" },
      new WeaveScriptLexer.PlainText("B"),
    );

    expect(WeaveScriptEvaluator.runScript("ignored by mock")).toBe("AB");
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
    delete WeaveScriptEvaluator.prototype.state;
  });

  it("covers isTruthy() for non-primitive values", () => {
    expect(WeaveScriptEvaluator.isTruthy({})).toBe(false);
    expect(WeaveScriptEvaluator.isTruthy(null)).toBe(false);
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

  it("throws on undefined state variable references", () => {
    globalThis.state = {};
    WeaveScriptEvaluator.prototype.state = {};

    mocked.segments.push(
      tokenBlock(
        new WeaveScriptParser.Block([new WeaveScriptParser.StateVarRef("$gold")]),
      ),
    );

    expect(() => WeaveScriptEvaluator.runScript("ignored by mock")).toThrow(
      /Undefined state variable \$gold/,
    );

    delete globalThis.state;
    delete WeaveScriptEvaluator.prototype.state;
  });
});
