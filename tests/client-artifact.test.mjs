import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { guides } from "../src/guides/catalog.js";
import { verifyClientArtifact } from "../scripts/verify-client-artifact.mjs";

async function writePublicFile(root, relative, contents = "approved public fixture\n") {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents, "utf8");
}

async function createValidArtifact(t) {
  const artifact = await mkdtemp(path.join(os.tmpdir(), "scopecraft-client-artifact-"));
  t.after(() => rm(artifact, { force: true, recursive: true }));

  for (const relative of [
    "index.html",
    "assets/app-AbCd1234.js",
    "assets/app-AbCd1234.css",
    "assets/inter-AbCd1234.woff2",
    "guides/index.html",
    ...guides.map((guide) => `guides/${guide.slug}/index.html`),
  ]) {
    await writePublicFile(artifact, relative);
  }

  const download = path.join(
    artifact,
    "downloads",
    "patent-drafting-practice-library-expanded.zip",
  );
  await mkdir(path.dirname(download), { recursive: true });
  await copyFile(
    new URL("../public/downloads/patent-drafting-practice-library-expanded.zip", import.meta.url),
    download,
  );

  return artifact;
}

test("accepts only the complete approved client artifact shape", async (t) => {
  const artifact = await createValidArtifact(t);
  const result = await verifyClientArtifact(artifact);

  assert.equal(result.clientDirectory, artifact);
  assert.equal(result.fileCount, guides.length + 6);
});

test("rejects private files, source maps, and source directories", async (t) => {
  for (const relative of [".env", "assets/app-AbCd1234.js.map", "src/App.jsx", "private.pem"]) {
    await t.test(relative, async (t) => {
      const artifact = await createValidArtifact(t);
      await writePublicFile(artifact, relative, "PRIVATE_SENTINEL\n");

      await assert.rejects(verifyClientArtifact(artifact), new RegExp(relative.replaceAll(".", "\\."), "u"));
    });
  }
});

test("rejects an unhashed asset that would be unsafe to cache immutably", async (t) => {
  const artifact = await createValidArtifact(t);
  await writePublicFile(artifact, "assets/stable-name.js");

  await assert.rejects(verifyClientArtifact(artifact), /assets\/stable-name\.js/iu);
});

test("rejects confidential content and unapproved public URL hosts", async (t) => {
  for (const [contents, expected] of [
    ["const source = '/Users/example/Confidential/matter.docx';\n", /absolute macOS path|private workspace path/iu],
    ["const source = 'https://unreviewed.example/source';\n", /unapproved public URL host/iu],
  ]) {
    await t.test(expected.source, async (t) => {
      const artifact = await createValidArtifact(t);
      await writePublicFile(artifact, "assets/leak-AbCd1234.js", contents);
      await assert.rejects(verifyClientArtifact(artifact), expected);
    });
  }
});

test("rejects a changed practice-library archive until its review manifest advances", async (t) => {
  const artifact = await createValidArtifact(t);
  await writeFile(
    path.join(artifact, "downloads", "patent-drafting-practice-library-expanded.zip"),
    "changed archive\n",
  );

  await assert.rejects(
    verifyClientArtifact(artifact),
    /digest does not match the reviewed archive|not a supported ZIP archive/iu,
  );
});

test("rejects symbolic links even when their names otherwise look public", async (t) => {
  const artifact = await createValidArtifact(t);
  const target = path.join(artifact, "assets", "app-AbCd1234.js");
  const link = path.join(artifact, "assets", "linked-AbCd1234.js");
  await symlink(target, link);

  await assert.rejects(verifyClientArtifact(artifact), /linked-AbCd1234\.js: symbolic links/u);
});

test("rejects an artifact that omits a required route shell", async (t) => {
  const artifact = await createValidArtifact(t);
  const missingGuide = path.join(artifact, "guides", guides[0].slug, "index.html");
  await rm(missingGuide);

  await assert.rejects(
    verifyClientArtifact(artifact),
    new RegExp(`guides/${guides[0].slug}/index\\.html: required public file is missing`, "u"),
  );
});
