#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultManifestPath = path.join(
  root,
  "data",
  "downloads",
  "reviewed-practice-library.json",
);
const defaultArchivePath = path.join(
  root,
  "public",
  "downloads",
  "patent-drafting-practice-library-expanded.zip",
);

export async function verifyDownloadApproval({
  approvedDigest = process.env.PRACTICE_LIBRARY_APPROVED_SHA256,
  archivePath = defaultArchivePath,
  manifestPath = defaultManifestPath,
} = {}) {
  if (!/^[a-f0-9]{64}$/u.test(approvedDigest ?? "")) {
    throw new Error(
      "PRACTICE_LIBRARY_APPROVED_SHA256 must contain the independently reviewed archive digest.",
    );
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const archiveDigest = createHash("sha256")
    .update(await readFile(archivePath))
    .digest("hex");
  if (manifest.sha256 !== approvedDigest || archiveDigest !== approvedDigest) {
    throw new Error(
      "Practice-library source, manifest, and independent approval digest do not match.",
    );
  }
  return approvedDigest;
}

export async function main() {
  const digest = await verifyDownloadApproval();
  console.log(`Verified independent practice-library approval ${digest}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
