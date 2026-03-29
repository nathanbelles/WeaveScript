import { describe, expect, it } from "vitest";
import { WeaveScriptLexer } from "../lexer.js";

describe("WeaveScriptLexer", () => {
  it("splits plain text and block tokens", () => {
    const segments = WeaveScriptLexer.tokenize("Hello #{1+2}!");

    expect(segments).toHaveLength(3);
    expect(segments[0]).toBeInstanceOf(WeaveScriptLexer.PlainText);
    expect(segments[0].text).toBe("Hello ");
    expect(segments[1]).toBeInstanceOf(WeaveScriptLexer.TokenList);
    expect(segments[1].map((t) => t.type)).toEqual([
      WeaveScriptLexer.TokenType.NUMBER,
      WeaveScriptLexer.TokenType.OP_ARITH,
      WeaveScriptLexer.TokenType.NUMBER,
    ]);
    expect(segments[2]).toBeInstanceOf(WeaveScriptLexer.PlainText);
    expect(segments[2].text).toBe("!");
  });

  it("skips whitespace tokens inside blocks", () => {
    const segments = WeaveScriptLexer.tokenize("X#{  1 +\n 2\t}Y");
    const tokens = segments[1];

    expect(tokens).toBeInstanceOf(WeaveScriptLexer.TokenList);
    expect(tokens.map((t) => t.type)).toEqual([
      WeaveScriptLexer.TokenType.NUMBER,
      WeaveScriptLexer.TokenType.OP_ARITH,
      WeaveScriptLexer.TokenType.NUMBER,
    ]);
    expect(tokens.map((t) => t.value)).toEqual(["1", "+", "2"]);
  });

  it("tokenizes null/undefined literals inside blocks", () => {
    const segments = WeaveScriptLexer.tokenize("A#{null}B#{undefined}C");
    const nullTokens = segments[1];
    const undefTokens = segments[3];

    expect(nullTokens.map((t) => t.type)).toEqual([WeaveScriptLexer.TokenType.NULL]);
    expect(nullTokens.map((t) => t.value)).toEqual(["null"]);
    expect(undefTokens.map((t) => t.type)).toEqual([WeaveScriptLexer.TokenType.NULL]);
    expect(undefTokens.map((t) => t.value)).toEqual(["undefined"]);
  });

  it("finds block end when string contains braces", () => {
    const src = '#{"{ not a close } still in string"} tail';
    const end = WeaveScriptLexer.findBlockEnd(src, 2);
    expect(src[end]).toBe("}");
    expect(end).toBe(35);
  });

  it("finds block end when string contains escaped quotes", () => {
    const src = '#{"She said \\"hi and kept going"} tail';
    const end = WeaveScriptLexer.findBlockEnd(src, 2);
    expect(src[end]).toBe("}");
    expect(src.slice(0, end + 1)).toBe(
      '#{"She said \\"hi and kept going"}',
    );
  });

  it("throws for unclosed blocks", () => {
    expect(() => WeaveScriptLexer.tokenize("start #{1 + 2")).toThrow(
      /Unclosed #\{ block/,
    );
  });

  it("throws on unexpected characters while tokenizing", () => {
    expect(() => WeaveScriptLexer.tokenize("ok #{@}")).toThrow(
      /Unexpected character '@'/,
    );
  });
});
