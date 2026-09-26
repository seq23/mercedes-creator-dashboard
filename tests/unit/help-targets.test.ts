// The help-targets-exist validator reads a fill directive's selector only: the typed value after
// `=>` is what the screenshot job types (an email with dots, a name with spaces), never a class
// or id to look for on a screen. Pinned 26 Sep 2026 when the owner's address gained a dot.
import { describe, expect, it } from "vitest";
import { selectorOf } from "../../scripts/validators/help-targets-exist.mjs";

describe("help-targets-exist: fill directives", () => {
  it("checks the selector, not the value typed into it", () => {
    expect(selectorOf("fill", 'input[type="email"] => mercasare.social@gmail.com')).toBe('input[type="email"]');
    expect(selectorOf("fill", "#name => Mercedes Asare (TEST kit)")).toBe("#name");
  });
  it("leaves click and target directives whole", () => {
    expect(selectorOf("click", "text=Save => keep")).toBe("text=Save => keep");
    expect(selectorOf("target", ".btn.primary")).toBe(".btn.primary");
  });
});
