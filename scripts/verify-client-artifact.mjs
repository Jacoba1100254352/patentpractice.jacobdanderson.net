#!/usr/bin/env node
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { guides } from "../src/guides/catalog.js";
import {
  APPROVED_PUBLIC_URL_HOSTS,
  approvedHttpsUrl,
} from "../src/security/publicUrlPolicy.js";
import { inspectPracticeLibrary } from "./archive-security.mjs";
import { verifyDownloadApproval } from "./verify-download-approval.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultClientDirectory = path.join(root, "dist", "client");
const downloadPath = "downloads/patent-drafting-practice-library-expanded.zip";
const downloadManifestPath = path.join(
  root,
  "data",
  "downloads",
  "reviewed-practice-library.json",
);
const assetPattern = /^assets\/[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9_-]{8}\.(?:css|ico|jpe?g|js|png|svg|webp|woff2?)$/u;
const publicTextFilePattern = /\.(?:css|html|js|svg)$/iu;
const forbiddenPublicContentPatterns = [
  [/\/Users\/[A-Za-z0-9._~/-]+/u, "absolute macOS path"],
  [/(?:^|[^A-Za-z0-9_])\/home\/[A-Za-z0-9._~/-]+/u, "absolute Linux home path"],
  [/[A-Za-z]:\\Users\\[^\s"'`<>]+/u, "absolute Windows user path"],
  [/(?:Confidential|\.ai-work|ops\/challenge-candidates)\//iu, "private workspace path"],
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u, "private-key material"],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u, "AWS access key"],
  [/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u, "GitHub credential"],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u, "API credential"],
  [
    /\b(?:attorneyNotes|clientName|inventorName|localPath|matterId|providerPayload|sourcePath)\s*[:=]/iu,
    "sensitive structured field",
  ],
];
const forbiddenPathPatterns = [
  [/(?:^|\/)\.[^/]+/u, "hidden path"],
  [
    /^(?:data|deploy|node_modules|ops|public|scripts|src|tests?|worker)(?:\/|$)/iu,
    "private source directory",
  ],
  [
    /^(?:AGENTS\.md|README(?:\.[^/]+)?|package(?:-lock)?\.json|vite\.config\.[^/]+|vitest\.config\.[^/]+)$/iu,
    "repository source or configuration file",
  ],
  [
    /\.(?:crt|csr|db|key|log|map|p12|pem|pfx|sql|sqlite3?|toml|ya?ml)$/iu,
    "private, diagnostic, or source-map extension",
  ],
];

function portablePath(candidate) {
  return candidate.split(path.sep).join("/");
}

function expectedFiles() {
  return new Set([
    "index.html",
    downloadPath,
    "guides/index.html",
    ...guides.map((guide) => `guides/${guide.slug}/index.html`),
  ]);
}

function rejectionReason(relative) {
  for (const [pattern, reason] of forbiddenPathPatterns) {
    if (pattern.test(relative)) return reason;
  }
  return "path is outside the approved public artifact allowlist";
}

function scanPublicText(contents, relative, violations) {
  for (const [pattern, reason] of forbiddenPublicContentPatterns) {
    if (pattern.test(contents)) violations.push(`${relative}: contains ${reason}`);
  }

  for (const match of contents.matchAll(/https?:\/\/[^\s"'`<>\)]+/giu)) {
    if (match[0].includes("\\")) {
      violations.push(`${relative}: contains an escaped or backslash-bearing public URL`);
      continue;
    }
    let parsed;
    try {
      parsed = new URL(match[0]);
    } catch {
      violations.push(`${relative}: contains an invalid public URL`);
      continue;
    }
    if (parsed.username || parsed.password) {
      violations.push(`${relative}: contains a credential-bearing URL`);
    }
    if (parsed.protocol === "http:" && parsed.hostname !== "www.w3.org") {
      violations.push(`${relative}: contains a non-HTTPS public URL for ${parsed.hostname}`);
    }
    if (parsed.protocol === "https:") {
      try {
        approvedHttpsUrl(match[0], {
          approvedHosts: APPROVED_PUBLIC_URL_HOSTS.artifact,
          label: `${relative} public URL`,
        });
      } catch (error) {
        violations.push(error.message);
      }
    } else if (parsed.hostname !== "www.w3.org") {
      violations.push(`${relative}: contains an unapproved public URL host ${parsed.hostname}`);
    }
  }
}

async function verifyReviewedDownload(clientDirectory, violations) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(downloadManifestPath, "utf8"));
  } catch (error) {
    violations.push(`${downloadPath}: reviewed manifest could not be read (${error.message})`);
    return;
  }
  if (
    manifest.schemaVersion !== "2.0.0" ||
    manifest.reviewStatus !== "reviewed" ||
    manifest.publicReleaseApproved !== true ||
    manifest.approvalReceipt?.type !== "github-actions-repository-variable" ||
    manifest.approvalReceipt?.variable !== "PRACTICE_LIBRARY_APPROVED_SHA256" ||
    manifest.approvalReceipt?.digestAlgorithm !== "sha256" ||
    manifest.archivePath !== downloadPath ||
    !/^[a-f0-9]{64}$/u.test(manifest.sha256 ?? "") ||
    !Array.isArray(manifest.entries)
  ) {
    violations.push(`${downloadPath}: reviewed manifest is incomplete or invalid`);
    return;
  }

  try {
    const archive = await readFile(path.join(clientDirectory, downloadPath));
    const inspection = await inspectPracticeLibrary(archive, { label: downloadPath });
    if (inspection.sha256 !== manifest.sha256) {
      violations.push(`${downloadPath}: digest does not match the reviewed archive`);
    }
    if (JSON.stringify(inspection.inventory) !== JSON.stringify(manifest.entries)) {
      violations.push(`${downloadPath}: recursive entry inventory does not match the reviewed archive`);
    }
  } catch (error) {
    violations.push(`${downloadPath}: ${error.message}`);
  }
}

async function inspectDirectory(directory, relativeDirectory, files, violations) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = portablePath(path.join(relativeDirectory, entry.name));
    const candidate = path.join(directory, entry.name);
    const metadata = await lstat(candidate);

    if (metadata.isSymbolicLink()) {
      violations.push(`${relative}: symbolic links are not allowed`);
      continue;
    }
    if (metadata.isDirectory()) {
      await inspectDirectory(candidate, relative, files, violations);
      continue;
    }
    if (!metadata.isFile()) {
      violations.push(`${relative}: non-regular files are not allowed`);
      continue;
    }

    files.add(relative);
    if (metadata.size === 0) violations.push(`${relative}: public files must not be empty`);
    if (publicTextFilePattern.test(relative)) {
      try {
        scanPublicText(await readFile(candidate, "utf8"), relative, violations);
      } catch (error) {
        violations.push(`${relative}: public text could not be inspected (${error.message})`);
      }
    }
  }
}

export async function verifyClientArtifact(
  clientDirectory = defaultClientDirectory,
  { approvedDigest = process.env.PRACTICE_LIBRARY_APPROVED_SHA256 } = {},
) {
  const resolvedClient = path.resolve(clientDirectory);
  const rootMetadata = await lstat(resolvedClient);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error(`Public client artifact must be a real directory: ${resolvedClient}`);
  }

  const files = new Set();
  const violations = [];
  try {
    await verifyDownloadApproval({
      approvedDigest,
      archivePath: path.join(resolvedClient, downloadPath),
      manifestPath: downloadManifestPath,
    });
  } catch (error) {
    violations.push(`${downloadPath}: independent approval failed (${error.message})`);
  }
  await inspectDirectory(resolvedClient, "", files, violations);

  const expected = expectedFiles();
  for (const relative of expected) {
    if (!files.has(relative)) violations.push(`${relative}: required public file is missing`);
  }

  for (const relative of files) {
    if (!expected.has(relative) && !assetPattern.test(relative)) {
      violations.push(`${relative}: ${rejectionReason(relative)}`);
    }
  }

  const assetRequirements = [
    ["JavaScript", /\.js$/u],
    ["CSS", /\.css$/u],
    ["web font", /\.woff2?$/u],
  ];
  const assets = [...files].filter((relative) => relative.startsWith("assets/"));
  for (const [label, pattern] of assetRequirements) {
    if (!assets.some((relative) => pattern.test(relative))) {
      violations.push(`assets/: at least one ${label} asset is required`);
    }
  }

  await verifyReviewedDownload(resolvedClient, violations);

  if (violations.length > 0) {
    throw new Error(
      ["Public client artifact verification failed:", ...violations.sort().map((item) => `- ${item}`)].join(
        "\n",
      ),
    );
  }

  return { clientDirectory: resolvedClient, fileCount: files.size };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  verifyClientArtifact()
    .then(({ clientDirectory, fileCount }) => {
      console.log(`Verified ${fileCount} approved public files in ${clientDirectory}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
