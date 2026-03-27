import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../evaluator.js", () => ({
  WeaveScriptEvaluator: {
    runScript: vi.fn((value) => `processed(${value})`),
  },
}));

import { WeaveScriptEvaluator } from "../evaluator.js";
import { init, updateStoryCards, updateTriggeredStoryCards } from "../run.js";

describe("run.js integration helpers", () => {
  beforeEach(() => {
    globalThis.state = {
      memory: {
        context: "ctx #{1+1}",
        authorsNote: "note #{2+2}",
      },
    };
    globalThis.storyCards = [];
    globalThis.updateStoryCard = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete globalThis.state;
    delete globalThis.storyCards;
    delete globalThis.updateStoryCard;
  });

  it("init evaluates context/authorsNote and calls updateStoryCards", () => {
    const context = { updateStoryCards: vi.fn() };
    init.call(context);

    expect(WeaveScriptEvaluator.runScript).toHaveBeenNthCalledWith(
      1,
      "ctx #{1+1}",
    );
    expect(WeaveScriptEvaluator.runScript).toHaveBeenNthCalledWith(
      2,
      "note #{2+2}",
    );
    expect(globalThis.state.memory.context).toBe("processed(ctx #{1+1})");
    expect(globalThis.state.memory.authorsNote).toBe("processed(note #{2+2})");
    expect(context.updateStoryCards).toHaveBeenCalledTimes(1);
    expect(context.updateStoryCards).toHaveBeenCalledWith(globalThis.storyCards);
  });

  it("updateStoryCards replaces existing entry block and calls updateStoryCard", () => {
    const cards = [
      {
        keys: "tag",
        type: "type",
        description: "#{EnableWeaveScript: true}Value #{1 + 2}",
        entry: "Entry start #{old}",
      },
    ];
    updateStoryCards(cards);

    expect(WeaveScriptEvaluator.runScript).toHaveBeenCalledWith("Value #{1 + 2}");
    expect(globalThis.updateStoryCard).toHaveBeenCalledWith(
      0,
      "tag",
      "Entry start #{processed(Value #{1 + 2})}",
      "type",
    );
  });

  it("updateStoryCards appends when entry has no existing block", () => {
    const cards = [
      {
        keys: "tag",
        type: "type",
        description: "#{EnableWeaveScript: true}Value #{1 + 2}",
        entry: "Entry start",
      },
    ];
    updateStoryCards(cards);

    expect(WeaveScriptEvaluator.runScript).toHaveBeenCalledWith("Value #{1 + 2}");
    expect(globalThis.updateStoryCard).toHaveBeenCalledWith(
      0,
      "tag",
      "Entry start#{processed(Value #{1 + 2})}",
      "type",
    );
  });

  it("updateStoryCards ignores cards without the enable marker", () => {
    const cards = [
      {
        keys: "tag",
        type: "type",
        description: "Not enabled #{1 + 2}",
        entry: "Entry start #{old}",
      },
    ];
    updateStoryCards(cards);

    expect(WeaveScriptEvaluator.runScript).not.toHaveBeenCalled();
    expect(globalThis.updateStoryCard).not.toHaveBeenCalled();
  });

  it("updateStoryCards uses explicit storyCard.index when provided", () => {
    const cards = [
      {
        index: 7,
        keys: "tag",
        type: "type",
        description: "#{EnableWeaveScript: true}X",
        entry: "E",
      },
    ];

    updateStoryCards(cards);

    expect(globalThis.updateStoryCard).toHaveBeenCalledWith(
      7,
      "tag",
      "E#{processed(X)}",
      "type",
    );
  });

  it("updateTriggeredStoryCards triggers only cards whose tags appear in text", () => {
    globalThis.storyCards = [
      {
        keys: "dragon, castle",
        type: "t",
        description: "#{EnableWeaveScript: true}D",
        entry: "E1",
      },
      {
        keys: "wizard",
        type: "t",
        description: "#{EnableWeaveScript: true}W",
        entry: "E2",
      },
      {
        keys: "dragon",
        type: "t",
        description: "Not enabled",
        entry: "E3",
      },
    ];

    updateTriggeredStoryCards("A dragon appears.");

    // Only the first card is enabled + triggered by "dragon".
    expect(globalThis.updateStoryCard).toHaveBeenCalledTimes(1);
    expect(globalThis.updateStoryCard).toHaveBeenCalledWith(
      0,
      "dragon, castle",
      "E1#{processed(D)}",
      "t",
    );
  });

  it("updateTriggeredStoryCards does nothing when no tags match", () => {
    globalThis.storyCards = [
      {
        keys: "dragon, castle",
        type: "t",
        description: "#{EnableWeaveScript: true}D",
        entry: "E1",
      },
      {
        keys: "wizard",
        type: "t",
        description: "#{EnableWeaveScript: true}W",
        entry: "E2",
      },
    ];

    updateTriggeredStoryCards("No relevant keywords here.");

    expect(globalThis.updateStoryCard).not.toHaveBeenCalled();
    expect(WeaveScriptEvaluator.runScript).not.toHaveBeenCalled();
  });
});
