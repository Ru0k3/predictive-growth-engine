import { describe, expect, it } from "vitest";
import { buildEvidenceEvents, buildStructuralOutline, retrieveEvidence } from "./content";

describe("content evidence pipeline", () => {
  it("builds a normalized outline from uploaded text", () => {
    const outline = buildStructuralOutline("# Hook\n\nA short opening promise.\n\n## Proof\n\nA longer proof section with enough context to retrieve later.");
    expect(outline).toHaveLength(4);
    expect(outline[0]?.heading).toBe("Hook");
    expect(outline.at(-1)?.position).toBe(1);
  });

  it("returns complete neighboring sections for an evidence position", () => {
    const outline = buildStructuralOutline("One.\n\nTwo.\n\nThree.");
    const result = retrieveEvidence(outline, "0.5", 1);
    expect(result.sections).toHaveLength(3);
    expect(result.text).toContain("Two.");
  });

  it("emits bounded semantic events for sharp structural changes", () => {
    const outline = buildStructuralOutline("Tiny.\n\nThis is a much longer paragraph with enough detail to create a material structural shift in the content map.");
    const events = buildEvidenceEvents(outline);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.evidenceText).toBeTruthy();
  });
});
