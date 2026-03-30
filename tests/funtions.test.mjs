import { afterEach, describe, expect, it, vi } from "vitest";
import { Functions } from "../funtions.js";

// Keep these tests independent of the evaluator module.
// This mirrors the truthiness rules used by the runtime.
const NULL = Object.freeze({
  toString() {
    return "";
  },
});

function isTruthy(value) {
  if (value === NULL) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "";
  return false;
}

function makeFunctions() {
  // Match the runtime wiring in evaluator: builtins depend on utils.
  // We spy so tests can assert delegation for coercion helpers.
  const isTruthySpy = vi.fn(isTruthy);
  const functions = new Functions({ isTruthy: isTruthySpy });
  return { functions, isTruthy: isTruthySpy };
}

function call(functions, name, ...args) {
  const def = functions.FUNCTION_DEFS[name];
  if (!def) throw new Error(`unknown builtin ${name}`);
  return def.fn(args);
}

describe("Functions.FUNCTION_DEFS builtin implementations", () => {
  it("round", () => {
    const { functions } = makeFunctions();
    expect(call(functions, "round", 1.2)).toBe(1);
    expect(call(functions, "round", 1.5)).toBe(2);
  });

  it("floor and ceil", () => {
    const { functions } = makeFunctions();
    expect(call(functions, "floor", 1.9)).toBe(1);
    expect(call(functions, "ceil", 1.1)).toBe(2);
  });

  it("abs", () => {
    const { functions } = makeFunctions();
    expect(call(functions, "abs", -3)).toBe(3);
  });

  it("min and max take two or more arguments", () => {
    const { functions } = makeFunctions();
    expect(call(functions, "min", 5, 2, 8)).toBe(2);
    expect(call(functions, "max", 5, 2, 8)).toBe(8);
  });

  it("clamp", () => {
    const { functions } = makeFunctions();
    expect(call(functions, "clamp", 5, 0, 10)).toBe(5);
    expect(call(functions, "clamp", -1, 0, 10)).toBe(0);
    expect(call(functions, "clamp", 99, 0, 10)).toBe(10);
  });

  it("random uses Math.random and default bound 100 with no args", () => {
    const { functions } = makeFunctions();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(call(functions, "random")).toBe(50);
    vi.restoreAllMocks();
  });

  it("random uses explicit bound when given", () => {
    const { functions } = makeFunctions();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(call(functions, "random", 10)).toBe(5);
    vi.restoreAllMocks();
  });

  it("string helpers", () => {
    const { functions } = makeFunctions();
    expect(call(functions, "toUpper", "ab")).toBe("AB");
    expect(call(functions, "toLower", "CD")).toBe("cd");
    expect(call(functions, "trim", "  x  ")).toBe("x");
    expect(call(functions, "length", "abc")).toBe(3);
    expect(call(functions, "substring", "hello", 1, 4)).toBe("ell");
    expect(call(functions, "substring", "hello", 2)).toBe("llo");
    expect(call(functions, "replace", "aba", "a", "x")).toBe("xba");
  });

  it("coercion helpers (toBoolean delegates via utils.isTruthy)", () => {
    const { functions, isTruthy } = makeFunctions();

    expect(call(functions, "toNumber", "12")).toBe(12);
    expect(call(functions, "toString", 3)).toBe("3");

    isTruthy.mockClear();
    expect(call(functions, "toBoolean", NULL)).toBe(false);
    expect(call(functions, "toBoolean", "")).toBe(false);
    expect(call(functions, "toBoolean", "x")).toBe(true);
    expect(call(functions, "toBoolean", 0)).toBe(false);
    expect(call(functions, "toBoolean", 2)).toBe(true);
    expect(call(functions, "toBoolean", false)).toBe(false);
    expect(call(functions, "toBoolean", true)).toBe(true);

    expect(isTruthy).toHaveBeenCalledTimes(7);
    expect(isTruthy).toHaveBeenCalledWith(NULL);
    expect(isTruthy).toHaveBeenCalledWith("");
    expect(isTruthy).toHaveBeenCalledWith("x");
    expect(isTruthy).toHaveBeenCalledWith(0);
    expect(isTruthy).toHaveBeenCalledWith(2);
    expect(isTruthy).toHaveBeenCalledWith(false);
    expect(isTruthy).toHaveBeenCalledWith(true);
  });

  it("type predicates", () => {
    const { functions } = makeFunctions();
    expect(call(functions, "isNumber", 1)).toBe(true);
    expect(call(functions, "isNumber", "1")).toBe(false);
    expect(call(functions, "isString", "1")).toBe(true);
    expect(call(functions, "isString", 1)).toBe(false);
    expect(call(functions, "isBoolean", true)).toBe(true);
    expect(call(functions, "isBoolean", 1)).toBe(false);
  });

  it("exposes only known keys", () => {
    const { functions } = makeFunctions();
    expect(Object.keys(functions.FUNCTION_DEFS).sort()).toEqual(
      [
        "abs",
        "ceil",
        "clamp",
        "floor",
        "isBoolean",
        "isNumber",
        "isString",
        "length",
        "max",
        "min",
        "random",
        "replace",
        "round",
        "substring",
        "toBoolean",
        "toLower",
        "toNumber",
        "toString",
        "toUpper",
        "trim",
      ].sort(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
