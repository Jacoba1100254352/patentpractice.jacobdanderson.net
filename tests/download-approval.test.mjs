import assert from "node:assert/strict";
import test from "node:test";

import { verifyDownloadApproval } from "../scripts/verify-download-approval.mjs";

const approvedDigest = "1866160df86ed088decc8da7c6ca12170377b90eb4f2b1cd7b4d16897bb9cbb0";

test("accepts the exact independently approved practice-library digest", async () => {
  assert.equal(await verifyDownloadApproval({ approvedDigest }), approvedDigest);
});

test("rejects absent or mismatched independent approval", async () => {
  await assert.rejects(verifyDownloadApproval({ approvedDigest: null }), /must contain/iu);
  await assert.rejects(
    verifyDownloadApproval({ approvedDigest: "0".repeat(64) }),
    /do not match/iu,
  );
});
