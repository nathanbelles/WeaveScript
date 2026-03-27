import { describe, expect, it } from "vitest";
import { WeaveScriptEvaluator } from "../evaluator.js";
import { init, updateStoryCards } from "../run.js";

describe("WeaveScript integration (lexer + parser + evaluator)", () => {
  it("renders mixed text with arithmetic and variables across blocks", () => {
    const input = [
      "Your name:  Alex\n",
      "Age:        #{var Age=19; Age}\n",
      "Sister's age: #{Age - 5}\n",
    ].join("");

    expect(WeaveScriptEvaluator.runScript(input)).toBe(
      ["Your name:  Alex\n", "Age:        19\n", "Sister's age: 14\n"].join(""),
    );
  });

  it("supports conditionals, nesting, and blank checks", () => {
    const input = [
      'Personality: #{if " " is blank then "Reserved" else " "}\n',
      "#{if 10 < 5 then \"no\" else if 10 < 20 then \"yes\" else \"no\"}\n",
    ].join("");

    expect(WeaveScriptEvaluator.runScript(input)).toBe(
      ["Personality: Reserved\n", "yes\n"].join(""),
    );
  });

  it("treats var-only blocks as empty output", () => {
    expect(WeaveScriptEvaluator.runScript("A#{var X=1}B")).toBe("AB");
  });

  it("handles operator precedence, parentheses, and logical operator word/symbol forms", () => {
    // not binds tighter than and/or; and binds tighter than or.
    // ((1+2)*3 == 9) and (not false) or false  => true
    const input =
      '#{if (1 + 2) * 3 == 9 and not false or false then "ok" else "bad"}';
    expect(WeaveScriptEvaluator.runScript(input)).toBe("ok");

    // Symbol forms: !, &&, ||
    const input2 = '#{if !(false) && (1 < 2) || false then "ok" else "bad"}';
    expect(WeaveScriptEvaluator.runScript(input2)).toBe("ok");
  });

  it("unescapes string literals correctly", () => {
    const input = '#{"a\\\\b \\"x\\" \\\'y\\\'"}';
    expect(WeaveScriptEvaluator.runScript(input)).toBe("a\\b \"x\" 'y'");
  });

  it("supports string concatenation with numbers and booleans", () => {
    const input = '#{"Age: " + 19 + ", adult: " + true}';
    expect(WeaveScriptEvaluator.runScript(input)).toBe("Age: 19, adult: true");
  });

  it("handles semicolon-separated statements and last-expression output", () => {
    const input = "#{var A=1; var B=2; A + B}";
    expect(WeaveScriptEvaluator.runScript(input)).toBe("3");
  });

  it("supports re-declaring variables (shadowing via var/set)", () => {
    const input = "#{var X=1; X; var X=2; X}";
    expect(WeaveScriptEvaluator.runScript(input)).toBe("2");
  });

  it("supports is not blank checks with whitespace vs empty", () => {
    const input = [
      '#{if "" is not blank then "bad" else "ok"}\n',
      '#{if "  " is not blank then "ok" else "bad"}\n',
    ].join("");
    expect(WeaveScriptEvaluator.runScript(input)).toBe(["ok\n", "bad\n"].join(""));
  });

  it("throws on undefined variable reads", () => {
    expect(() => WeaveScriptEvaluator.runScript("#{MissingVar}")).toThrow(
      /Undefined variable: MissingVar/,
    );
  });

  it("throws on division by zero and modulo by zero", () => {
    expect(() => WeaveScriptEvaluator.runScript("#{10 / 0}")).toThrow(
      /Division by zero/,
    );
    expect(() => WeaveScriptEvaluator.runScript("#{10 % 0}")).toThrow(
      /Modulo by zero/,
    );
  });

  it("if without else returns empty string when condition is false", () => {
    expect(
      WeaveScriptEvaluator.runScript('#{if false then "yes"}'),
    ).toBe("");
  });

  it("division works when divisor is not zero", () => {
    expect(WeaveScriptEvaluator.runScript("#{10 / 2}")).toBe("5");
  });

  it("modulo works when divisor is not zero", () => {
    expect(WeaveScriptEvaluator.runScript("#{10 % 3}")).toBe("1");
  });

  it("supports != comparisons", () => {
    expect(WeaveScriptEvaluator.runScript('#{if 1 != 2 then "t" else "f"}')).toBe(
      "t",
    );
  });

  it("supports > comparisons", () => {
    expect(WeaveScriptEvaluator.runScript('#{if 2 > 1 then "t" else "f"}')).toBe(
      "t",
    );
  });

  it("supports <= comparisons", () => {
    expect(WeaveScriptEvaluator.runScript('#{if 2 <= 2 then "t" else "f"}')).toBe(
      "t",
    );
  });

  it("supports >= comparisons", () => {
    expect(WeaveScriptEvaluator.runScript('#{if 2 >= 2 then "t" else "f"}')).toBe(
      "t",
    );
  });

  it("logical or works (word form)", () => {
    expect(WeaveScriptEvaluator.runScript('#{if false or true then "ok" else "bad"}')).toBe(
      "ok",
    );
  });

  it('truthiness: empty string ("") is falsey', () => {
    expect(WeaveScriptEvaluator.runScript('#{if "" then "t" else "f"}')).toBe("f");
  });

  it('truthiness: non-empty string (" ") is truthy', () => {
    expect(WeaveScriptEvaluator.runScript('#{if " " then "t" else "f"}')).toBe("t");
  });

  it("truthiness: 0 is falsey", () => {
    expect(WeaveScriptEvaluator.runScript('#{if 0 then "t" else "f"}')).toBe("f");
  });

  it("truthiness: non-zero numbers are truthy", () => {
    expect(WeaveScriptEvaluator.runScript('#{if 1 then "t" else "f"}')).toBe("t");
  });

  it("state variables can be assigned and then read (integration)", () => {
    globalThis.state = {};
    try {
      expect(WeaveScriptEvaluator.runScript("#{$gold = 100}")).toBe("");
      expect(globalThis.state.gold).toBeTypeOf("number");
      expect(WeaveScriptEvaluator.runScript("#{$gold}")).toBe("100");
    } finally {
      delete globalThis.state;
    }
  });

  it("lexer tolerates whitespace inside blocks (integration)", () => {
    const input = "X#{  1 +\n 2\t}Y";
    expect(WeaveScriptEvaluator.runScript(input)).toBe("X3Y");
  });

  it("fails on unclosed blocks (lexer error)", () => {
    expect(() => WeaveScriptEvaluator.runScript("Start #{1 + 2")).toThrow(
      /Unclosed #\{ block/,
    );
  });

  it("fails on unexpected characters in blocks (lexer error)", () => {
    expect(() => WeaveScriptEvaluator.runScript("X#{@}Y")).toThrow(
      /Unexpected character '@'/,
    );
  });

  it("fails on malformed if-expression missing then (parser error)", () => {
    // "then" keyword is required by grammar
    expect(() => WeaveScriptEvaluator.runScript('#{if true "ok" else "bad"}'))
      .toThrow(/Expected then/);
  });

  it("fails on unmatched parentheses (parser error)", () => {
    expect(() => WeaveScriptEvaluator.runScript("#{(1 + 2}")).toThrow(
      /Expected \)/,
    );
  });

  it("fails on unknown tokens in expressions (parser error)", () => {
    // "??" becomes an identifier? No, lexer will choke on "?".
    expect(() => WeaveScriptEvaluator.runScript("#{??}")).toThrow(
      /Unexpected character '\?'/,
    );
  });

  it("fails when reading an undefined state variable (evaluator error)", () => {
    globalThis.state = {};
    try {
      expect(() => WeaveScriptEvaluator.runScript("#{$gold}")).toThrow(
        /Undefined state variable \$gold/,
      );
    } finally {
      delete globalThis.state;
    }
  });
});

describe("WeaveScript integration through run.js", () => {
  it("init runs WeaveScript over context/authorsNote", () => {
    globalThis.state = {
      memory: {
        context: "Age: #{1 + 1}",
        authorsNote: 'Note: #{if true then "ok" else "bad"}',
      },
    };
    globalThis.storyCards = [
      {
        keys: "tag",
        type: "t",
        description: "#{EnableWeaveScript: true}Value: #{2 + 3}",
        entry: "Card entry: ",
      },
    ];
    globalThis.updateStoryCard = () => {};

    try {
      init.call({ updateStoryCards });

      expect(globalThis.state.memory.context).toBe("Age: 2");
      expect(globalThis.state.memory.authorsNote).toBe("Note: ok");
    } finally {
      delete globalThis.state;
      delete globalThis.storyCards;
      delete globalThis.updateStoryCard;
    }
  });

  it("init triggers story card updates (end-to-end)", () => {
    globalThis.state = {
      memory: {
        context: "",
        authorsNote: "",
      },
    };
    globalThis.storyCards = [
      {
        keys: "tag",
        type: "t",
        description: "#{EnableWeaveScript: true}Value: #{2 + 3}",
        entry: "Card entry: ",
      },
    ];
    globalThis.updateStoryCard = (index, keys, entry, type) => {
      globalThis.storyCards[index].entry = entry;
    };

    try {
      init.call({ updateStoryCards });

      expect(globalThis.storyCards[0].entry).toBe("Card entry: #{Value: 5}");
    } finally {
      delete globalThis.state;
      delete globalThis.storyCards;
      delete globalThis.updateStoryCard;
    }
  });
});

