import { describe, expect, it } from "vitest";
import { buildTelegramThreadParams } from "./thread-params.js";

describe("buildTelegramThreadParams", () => {
  it("returns undefined for null input", () => {
    expect(buildTelegramThreadParams(null)).toBeUndefined();
  });
  it("returns undefined for no id", () => {
    expect(buildTelegramThreadParams({ scope: "forum" })).toBeUndefined();
  });
  it("returns message_thread_id for valid thread", () => {
    expect(buildTelegramThreadParams({ id: 42, scope: "forum" })).toEqual({
      message_thread_id: 42,
    });
  });
  it("returns undefined for General topic (id=1, forum scope)", () => {
    expect(buildTelegramThreadParams({ id: 1, scope: "forum" })).toBeUndefined();
  });
  it("returns message_thread_id for id=1 with dm scope", () => {
    expect(buildTelegramThreadParams({ id: 1, scope: "dm" })).toEqual({
      message_thread_id: 1,
    });
  });
});
