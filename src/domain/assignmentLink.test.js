import { describe, expect, it } from "vitest";

import {
  buildAssignmentLink,
  parseAssignmentLink,
  replaceAssignmentMode,
} from "./assignmentLink.js";

const catalog = [
  {
    id: "challenge-01-pressure-history-adaptive-mouse",
    slug: "pressure-history-adaptive-mouse",
    availableModes: ["guided", "practitioner", "examiner"],
  },
];

describe("assignment links", () => {
  it("accepts either a challenge slug or stable identifier", () => {
    expect(
      parseAssignmentLink(
        "?challenge=pressure-history-adaptive-mouse&mode=guided",
        catalog,
      ),
    ).toMatchObject({
      valid: true,
      challengeId: catalog[0].id,
      challengeSlug: catalog[0].slug,
      modeId: "guided",
    });
    expect(
      parseAssignmentLink(
        `?challenge=${catalog[0].id}&mode=examiner`,
        catalog,
      ),
    ).toMatchObject({ valid: true, modeId: "examiner" });
  });

  it("distinguishes an ordinary visit from an invalid assignment", () => {
    expect(parseAssignmentLink("?fresh=1", catalog)).toMatchObject({
      status: "absent",
      requested: false,
    });
    expect(parseAssignmentLink("?challenge=&mode=", catalog)).toMatchObject({
      status: "invalid",
      requested: true,
      valid: false,
    });
    expect(
      parseAssignmentLink("?challenge=&mode=", catalog).errors.join(" "),
    ).toMatch(/missing a challenge.*missing a practice mode/iu);
    expect(
      parseAssignmentLink("?challenge=missing&mode=guided", catalog),
    ).toMatchObject({ status: "invalid", requested: true, valid: false });
    expect(
      parseAssignmentLink(
        "?challenge=pressure-history-adaptive-mouse&mode=impossible",
        catalog,
      ).errors.join(" "),
    ).toMatch(/mode that is not available/iu);
  });

  it("builds a canonical root link containing only challenge and mode", () => {
    expect(
      buildAssignmentLink({
        baseUrl: "https://example.test/guides/?old=1#section",
        challenge: catalog[0],
        modeId: "practitioner",
      }),
    ).toBe(
      "https://example.test/?challenge=pressure-history-adaptive-mouse&mode=practitioner",
    );
  });

  it("updates a selected assignment mode without dropping unrelated launch flags", () => {
    expect(
      replaceAssignmentMode(
        "?challenge=pressure-history-adaptive-mouse&mode=guided&fresh=1",
        "examiner",
      ),
    ).toBe(
      "?challenge=pressure-history-adaptive-mouse&mode=examiner&fresh=1",
    );
  });
});
