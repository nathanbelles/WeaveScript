import { describe, expect, it, vi } from "vitest";

// The parser imports the lexer module for token type constants and names.
// For unit-testing the parser in isolation, we mock the lexer module and
// feed handcrafted token streams into the parser.
vi.mock("../lexer.js", () => {
  const TokenType = Object.freeze({
    // Only the token types needed by these parser tests.
    KW_VAR: 1,
    KW_IF: 2,
    KW_THEN: 3,
    KW_ELSE: 4,
    KW_AND: 5,
    KW_OR: 6,
    KW_NOT: 7,
    KW_IS: 8,
    KW_BLANK: 9,
    BOOL: 10,
    LPAREN: 11,
    RPAREN: 12,
    OP_ASSIGN: 13,
    OP_ARITH: 14,
    OP_CMP: 15,
    OP_AND: 16,
    OP_OR: 17,
    OP_NOT: 18,
    SEMICOLON: 19,
    IDENTIFIER: 20,
    NUMBER: 21,
    STRING: 22,
    STATE_VAR: 23,
    NULL: 24,
  });

  const TOKEN_NAMES = Object.freeze({
    [TokenType.KW_VAR]: "var or set",
    [TokenType.KW_IF]: "if",
    [TokenType.KW_THEN]: "then",
    [TokenType.KW_ELSE]: "else",
    [TokenType.KW_AND]: "and",
    [TokenType.KW_OR]: "or",
    [TokenType.KW_NOT]: "not",
    [TokenType.KW_IS]: "is",
    [TokenType.KW_BLANK]: "blank",
    [TokenType.BOOL]: "true or false",
    [TokenType.LPAREN]: "(",
    [TokenType.RPAREN]: ")",
    [TokenType.OP_ASSIGN]: "=",
    [TokenType.OP_ARITH]: "an arithmetic operator",
    [TokenType.OP_CMP]: "a relational operator",
    [TokenType.OP_AND]: "&&",
    [TokenType.OP_OR]: "||",
    [TokenType.OP_NOT]: "!",
    [TokenType.SEMICOLON]: ";",
    [TokenType.IDENTIFIER]: "an identifier",
    [TokenType.NUMBER]: "a number",
    [TokenType.STRING]: "a string",
    [TokenType.STATE_VAR]: "state variable",
    [TokenType.NULL]: "null",
  });

  return {
    WeaveScriptLexer: {
      TokenType,
      TOKEN_NAMES,
    },
  };
});

import { WeaveScriptLexer } from "../lexer.js";
import { WeaveScriptParser } from "../parser.js";

function parseFromTokens(tokens) {
  const parser = new WeaveScriptParser(tokens);
  return parser.parseBlock();
}

describe("WeaveScriptParser", () => {
  it("parses var declaration followed by expression", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.KW_VAR, value: "var" },
      { type: WeaveScriptLexer.TokenType.IDENTIFIER, value: "Age" },
      { type: WeaveScriptLexer.TokenType.OP_ASSIGN, value: "=" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "19" },
      { type: WeaveScriptLexer.TokenType.SEMICOLON, value: ";" },
      { type: WeaveScriptLexer.TokenType.IDENTIFIER, value: "Age" },
    ]);

    expect(ast).toBeInstanceOf(WeaveScriptParser.Block);
    expect(ast.statements[0]).toBeInstanceOf(WeaveScriptParser.VarDecl);
    expect(ast.statements[0].identifier).toBe("Age");
    expect(ast.statements[0].value).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(ast.statements[0].value.value).toBe("19");
    expect(ast.statements[1]).toBeInstanceOf(WeaveScriptParser.VariableRef);
    expect(ast.statements[1].identifier).toBe("Age");
  });

  it("respects arithmetic precedence", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "1" },
      { type: WeaveScriptLexer.TokenType.OP_ARITH, value: "+" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "2" },
      { type: WeaveScriptLexer.TokenType.OP_ARITH, value: "*" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "3" },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.BinaryOp);
    expect(expr.operator).toBe("+");
    expect(expr.left).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(expr.left.value).toBe("1");
    expect(expr.right).toBeInstanceOf(WeaveScriptParser.BinaryOp);
    expect(expr.right.operator).toBe("*");
    expect(expr.right.left).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(expr.right.left.value).toBe("2");
    expect(expr.right.right).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(expr.right.right.value).toBe("3");
  });

  it("parses if/then/else expressions", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.KW_IF, value: "if" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "1" },
      { type: WeaveScriptLexer.TokenType.OP_CMP, value: "<" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "2" },
      { type: WeaveScriptLexer.TokenType.KW_THEN, value: "then" },
      { type: WeaveScriptLexer.TokenType.STRING, value: '"yes"' },
      { type: WeaveScriptLexer.TokenType.KW_ELSE, value: "else" },
      { type: WeaveScriptLexer.TokenType.STRING, value: '"no"' },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.IfExpr);
    expect(expr.condition).toBeInstanceOf(WeaveScriptParser.BinaryOp);
    expect(expr.condition.operator).toBe("<");
    expect(expr.condition.left).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(expr.condition.left.value).toBe("1");
    expect(expr.condition.right).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(expr.condition.right.value).toBe("2");
    expect(expr.consequent).toBeInstanceOf(WeaveScriptParser.StringLiteral);
    expect(expr.consequent.value).toBe('"yes"');
    expect(expr.alternate).toBeInstanceOf(WeaveScriptParser.StringLiteral);
    expect(expr.alternate.value).toBe('"no"');
  });

  it("parses if/then without else (alternate null)", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.KW_IF, value: "if" },
      { type: WeaveScriptLexer.TokenType.BOOL, value: "true" },
      { type: WeaveScriptLexer.TokenType.KW_THEN, value: "then" },
      { type: WeaveScriptLexer.TokenType.STRING, value: '"ok"' },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.IfExpr);
    expect(expr.condition).toBeInstanceOf(WeaveScriptParser.BoolLiteral);
    expect(expr.condition.value).toBe(true);
    expect(expr.consequent).toBeInstanceOf(WeaveScriptParser.StringLiteral);
    expect(expr.alternate).toBe(null);
  });

  it("parses variable assignment in if consequent body", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.KW_IF, value: "if" },
      { type: WeaveScriptLexer.TokenType.BOOL, value: "true" },
      { type: WeaveScriptLexer.TokenType.KW_THEN, value: "then" },
      { type: WeaveScriptLexer.TokenType.KW_VAR, value: "var" },
      { type: WeaveScriptLexer.TokenType.IDENTIFIER, value: "X" },
      { type: WeaveScriptLexer.TokenType.OP_ASSIGN, value: "=" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "1" },
      { type: WeaveScriptLexer.TokenType.KW_ELSE, value: "else" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "0" },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.IfExpr);
    expect(expr.consequent).toBeInstanceOf(WeaveScriptParser.VarDecl);
    expect(expr.consequent.identifier).toBe("X");
    expect(expr.consequent.value).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(expr.consequent.value.value).toBe("1");
    expect(expr.alternate).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(expr.alternate.value).toBe("0");
  });

  it("parses variable assignment in else body", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.KW_IF, value: "if" },
      { type: WeaveScriptLexer.TokenType.BOOL, value: "false" },
      { type: WeaveScriptLexer.TokenType.KW_THEN, value: "then" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "0" },
      { type: WeaveScriptLexer.TokenType.KW_ELSE, value: "else" },
      { type: WeaveScriptLexer.TokenType.KW_VAR, value: "var" },
      { type: WeaveScriptLexer.TokenType.IDENTIFIER, value: "X" },
      { type: WeaveScriptLexer.TokenType.OP_ASSIGN, value: "=" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "2" },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.IfExpr);
    expect(expr.consequent).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(expr.consequent.value).toBe("0");
    expect(expr.alternate).toBeInstanceOf(WeaveScriptParser.VarDecl);
    expect(expr.alternate.identifier).toBe("X");
    expect(expr.alternate.value).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(expr.alternate.value.value).toBe("2");
  });

  it("parses state variable assignment in if consequent body", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.KW_IF, value: "if" },
      { type: WeaveScriptLexer.TokenType.BOOL, value: "true" },
      { type: WeaveScriptLexer.TokenType.KW_THEN, value: "then" },
      { type: WeaveScriptLexer.TokenType.STATE_VAR, value: "$a" },
      { type: WeaveScriptLexer.TokenType.OP_ASSIGN, value: "=" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "1" },
      { type: WeaveScriptLexer.TokenType.KW_ELSE, value: "else" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "0" },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.IfExpr);
    expect(expr.consequent).toBeInstanceOf(WeaveScriptParser.StateVarAssign);
    expect(expr.consequent.identifier).toBe("$a");
    expect(expr.consequent.value).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(expr.consequent.value.value).toBe("1");
    expect(expr.alternate).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
  });

  it("parses state variable assignment in else body", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.KW_IF, value: "if" },
      { type: WeaveScriptLexer.TokenType.BOOL, value: "false" },
      { type: WeaveScriptLexer.TokenType.KW_THEN, value: "then" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "0" },
      { type: WeaveScriptLexer.TokenType.KW_ELSE, value: "else" },
      { type: WeaveScriptLexer.TokenType.STATE_VAR, value: "$a" },
      { type: WeaveScriptLexer.TokenType.OP_ASSIGN, value: "=" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "2" },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.IfExpr);
    expect(expr.consequent).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(expr.alternate).toBeInstanceOf(WeaveScriptParser.StateVarAssign);
    expect(expr.alternate.identifier).toBe("$a");
    expect(expr.alternate.value).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(expr.alternate.value.value).toBe("2");
  });

  it("parses blank checks", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.IDENTIFIER, value: "Name" },
      { type: WeaveScriptLexer.TokenType.KW_IS, value: "is" },
      { type: WeaveScriptLexer.TokenType.KW_NOT, value: "not" },
      { type: WeaveScriptLexer.TokenType.KW_BLANK, value: "blank" },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.UnaryOp);
    expect(expr.operator).toBe("is_not_blank");
    expect(expr.operand).toBeInstanceOf(WeaveScriptParser.VariableRef);
    expect(expr.operand.identifier).toBe("Name");
  });

  it("parses is blank checks", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.IDENTIFIER, value: "Name" },
      { type: WeaveScriptLexer.TokenType.KW_IS, value: "is" },
      { type: WeaveScriptLexer.TokenType.KW_BLANK, value: "blank" },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.UnaryOp);
    expect(expr.operator).toBe("is_blank");
    expect(expr.operand).toBeInstanceOf(WeaveScriptParser.VariableRef);
    expect(expr.operand.identifier).toBe("Name");
  });

  it("parses logical operators (word + symbol forms)", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.BOOL, value: "true" },
      { type: WeaveScriptLexer.TokenType.KW_AND, value: "and" },
      { type: WeaveScriptLexer.TokenType.BOOL, value: "false" },
      { type: WeaveScriptLexer.TokenType.OP_OR, value: "||" },
      { type: WeaveScriptLexer.TokenType.BOOL, value: "true" },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.BinaryOp);
    expect(expr.operator).toBe("or");
    expect(expr.left).toBeInstanceOf(WeaveScriptParser.BinaryOp);
    expect(expr.left.operator).toBe("and");
  });

  it("parses unary not (symbol form) with correct precedence", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.OP_NOT, value: "!" },
      { type: WeaveScriptLexer.TokenType.BOOL, value: "false" },
      { type: WeaveScriptLexer.TokenType.OP_OR, value: "||" },
      { type: WeaveScriptLexer.TokenType.BOOL, value: "false" },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.BinaryOp);
    expect(expr.operator).toBe("or");
    expect(expr.left).toBeInstanceOf(WeaveScriptParser.UnaryOp);
    expect(expr.left.operator).toBe("not");
  });

  it("parses parenthesized expressions", () => {
    // (1 + 2) * 3
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.LPAREN, value: "(" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "1" },
      { type: WeaveScriptLexer.TokenType.OP_ARITH, value: "+" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "2" },
      { type: WeaveScriptLexer.TokenType.RPAREN, value: ")" },
      { type: WeaveScriptLexer.TokenType.OP_ARITH, value: "*" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "3" },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.BinaryOp);
    expect(expr.operator).toBe("*");
    expect(expr.left).toBeInstanceOf(WeaveScriptParser.BinaryOp);
    expect(expr.left.operator).toBe("+");
  });

  it("throws a ParserError when expect() token type mismatches", () => {
    // var 19 = ...
    expect(() =>
      parseFromTokens([
        { type: WeaveScriptLexer.TokenType.KW_VAR, value: "var" },
        { type: WeaveScriptLexer.TokenType.NUMBER, value: "19" },
      ]),
    ).toThrow(/Expected an identifier, received 19/);
  });

  it("throws a ParserError on unexpected factor tokens", () => {
    expect(() =>
      parseFromTokens([
        { type: 999, value: "??" },
      ]),
    ).toThrow(/Unexpected token: \?\?/);
  });

  it("throws a ParserError when expect() hits end of input", () => {
    expect(() =>
      parseFromTokens([
        { type: WeaveScriptLexer.TokenType.LPAREN, value: "(" },
        { type: WeaveScriptLexer.TokenType.NUMBER, value: "1" },
        // missing RPAREN
      ]),
    ).toThrow(/Expected \), received end of input/);
  });

  it("throws a ParserError on unexpected end of input while parsing a factor", () => {
    // 1 +
    expect(() =>
      parseFromTokens([
        { type: WeaveScriptLexer.TokenType.NUMBER, value: "1" },
        { type: WeaveScriptLexer.TokenType.OP_ARITH, value: "+" },
      ]),
    ).toThrow(/Unexpected end of input/);
  });

  it("parses state variable reference factors", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.STATE_VAR, value: "$gold" },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.StateVarRef);
    expect(expr.identifier).toBe("$gold");
  });

  it("parses state variable assignment statements", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.STATE_VAR, value: "$gold" },
      { type: WeaveScriptLexer.TokenType.OP_ASSIGN, value: "=" },
      { type: WeaveScriptLexer.TokenType.NUMBER, value: "100" },
    ]);
    const stmt = ast.statements[0];

    expect(stmt).toBeInstanceOf(WeaveScriptParser.StateVarAssign);
    expect(stmt.identifier).toBe("$gold");
    expect(stmt.value).toBeInstanceOf(WeaveScriptParser.NumberLiteral);
    expect(stmt.value.value).toBe("100");
  });

  it("parses null literals", () => {
    const ast = parseFromTokens([
      { type: WeaveScriptLexer.TokenType.NULL, value: "null" },
    ]);
    const expr = ast.statements[0];

    expect(expr).toBeInstanceOf(WeaveScriptParser.NullLiteral);
  });
  
});
