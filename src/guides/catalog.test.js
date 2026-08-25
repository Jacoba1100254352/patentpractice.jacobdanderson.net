import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { getGuideBySlug, guideCategories, guideHref, guides } from "./catalog.js";

const APPROVED_SOURCE_HOSTS = new Set(["www.uspto.gov", "uscode.house.gov"]);

describe("drafting guide catalog", () => {
  it("has unique, internally consistent routes and sections", () => {
    expect(guides).toHaveLength(8);
    expect(new Set(guides.map((guide) => guide.slug)).size).toBe(guides.length);
    const categories = new Set(guideCategories.map((category) => category.id));

    for (const guide of guides) {
      expect(guide.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      expect(categories.has(guide.category)).toBe(true);
      expect(guide.title).toBeTruthy();
      expect(guide.description).toBeTruthy();
      expect(guide.takeaway).toBeTruthy();
      expect(guide.sections.length).toBeGreaterThan(0);
      expect(guide.checklist.length).toBeGreaterThan(0);
      expect(guideHref(guide.slug)).toBe(`/guides/${guide.slug}/`);
      expect(getGuideBySlug(guide.slug)).toBe(guide);
      expect(new Set(guide.sections.map((section) => section.id)).size).toBe(guide.sections.length);

      for (const relatedSlug of guide.related) {
        expect(relatedSlug).not.toBe(guide.slug);
        expect(getGuideBySlug(relatedSlug)).not.toBeNull();
      }
    }
  });

  it("uses only approved official sources and contains no development residue", () => {
    const serialized = JSON.stringify({ guideCategories, guides });
    expect(serialized).not.toMatch(/(?:C:\\Users\\|C:\/Users\/|\/Users\/|\/home\/|\.codex\/|attachments\/|pasted-text\.txt|artifact\.md|\.inspect\.ndjson|turn\d+(?:search|view|fetch)\d+)/iu);

    for (const guide of guides) {
      for (const source of guide.sources) {
        const url = new URL(source.href ?? source.url);
        expect(url.protocol).toBe("https:");
        expect(APPROVED_SOURCE_HOSTS.has(url.hostname)).toBe(true);
        expect(source.title ?? source.label).toBeTruthy();
      }
    }
  });

  it("ships the reviewed expanded guide-library archive", async () => {
    const archive = await readFile(
      new URL("../../public/downloads/patent-drafting-practice-library-expanded.zip", import.meta.url),
    );
    expect(archive.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(archive.byteLength).toBeGreaterThan(100_000);
  });
});
