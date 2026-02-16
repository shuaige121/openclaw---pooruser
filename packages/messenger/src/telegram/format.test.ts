import { describe, expect, it } from "vitest";
import { renderTelegramHtmlText, markdownToTelegramHtml } from "./format.js";

describe("renderTelegramHtmlText", () => {
  it("passes through HTML when textMode is html", () => {
    expect(renderTelegramHtmlText("<b>hi</b>", { textMode: "html" })).toBe("<b>hi</b>");
  });
  it("converts markdown to HTML by default", () => {
    const result = renderTelegramHtmlText("**bold**");
    expect(result).toContain("<b>");
    expect(result).toContain("bold");
  });
});

describe("markdownToTelegramHtml", () => {
  it("converts bold", () => {
    expect(markdownToTelegramHtml("**hello**")).toContain("<b>hello</b>");
  });
  it("converts italic", () => {
    expect(markdownToTelegramHtml("*hello*")).toContain("<i>hello</i>");
  });
  it("converts inline code", () => {
    expect(markdownToTelegramHtml("`code`")).toContain("<code>code</code>");
  });
  it("escapes HTML entities in text", () => {
    const result = markdownToTelegramHtml("a < b");
    expect(result).toContain("&lt;");
  });
  it("converts links", () => {
    const result = markdownToTelegramHtml("[click](https://example.com)");
    expect(result).toContain("click");
    expect(result).toContain("example.com");
  });
});
