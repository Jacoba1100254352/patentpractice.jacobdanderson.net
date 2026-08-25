import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { guides } from "../src/guides/catalog.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const omittedTopLevelEntries = new Set([
  ".git",
  ".openai",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
  "worker",
]);
const forbiddenClientContent = [
  ["Sites authorization header", /OAI-Sites-Authorization/iu],
  ["OpenAI-specific header", /x-openai-/iu],
  ["Sites project identifier", /appgprj_[a-z0-9]+/iu],
  ["Sites deployment domain", /chatgpt\.site/iu],
  ["Sites metadata path", /["'`]\/?\.openai(?:\/|["'`])/iu],
  ["Sites runtime binding", /\b[a-z_$][\w$]*(?:\?\.|\.)(?:ASSETS|D1|R2)\b/iu],
  ["Sites runtime bracket binding", /\[\s*["'](?:ASSETS|D1|R2)["']\s*\]/u],
  [
    "Sites runtime destructured binding",
    /\b(?:const|let|var)\s*\{[^{}]*\b(?:ASSETS|D1|R2)\b[^{}]*\}\s*=/u,
  ],
  ["D1 or R2 runtime type", /\b(?:D1Database|R2Bucket)\b/u],
  ["provider authentication path", /["'`]\/(?:_?openai|\.openai)\/auth(?:[/?#"'`]|$)/iu],
];
const forbiddenRuntimePackages = [
  /^@cloudflare\//u,
  /^@openai\/sites(?:-|$)/u,
  /^cloudflare$/u,
  /^miniflare$/u,
  /^wrangler$/u,
];

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function textFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await textFiles(candidate)));
    if (entry.isFile() && /\.(?:css|html|js|json|jsx|mjs)$/u.test(entry.name)) {
      files.push(candidate);
    }
  }
  return files;
}

async function assertProviderNeutral(files, relativeTo) {
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    for (const [label, pattern] of forbiddenClientContent) {
      assert.doesNotMatch(contents, pattern, `${label} found in ${path.relative(relativeTo, file)}`);
    }
  }
}

async function regularFile(candidate) {
  try {
    return (await lstat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function startNginxContractServer(portable) {
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const candidate = path.resolve(portable, `.${pathname}`);
      const insidePortable =
        candidate === portable || candidate.startsWith(`${portable}${path.sep}`);
      const isAssetRequest = pathname.startsWith("/assets/");
      const isDownloadRequest = pathname.startsWith("/downloads/");
      const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;

      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405).end("method not allowed");
        return;
      }

      const candidates = insidePortable
        ? [
            candidate,
            path.join(candidate, "index.html"),
            ...(!isAssetRequest && !isDownloadRequest && acceptsHtml
              ? [path.join(portable, "index.html")]
              : []),
          ]
        : [];
      let selected = null;
      for (const item of candidates) {
        if (await regularFile(item)) {
          selected = item;
          break;
        }
      }

      if (!selected) {
        response.writeHead(404).end("not found");
        return;
      }

      const body = await readFile(selected);
      const contentTypes = {
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".zip": "application/zip",
      };
      response.writeHead(200, {
        "content-type": contentTypes[path.extname(selected)] ?? "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    })().catch((error) => {
      response.writeHead(500).end(error.message);
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test(
  "builds the complete portable artifact with Sites inputs absent",
  { timeout: 120_000 },
  async (t) => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "scopecraft-portable-"));
    t.after(async () => rm(temporaryRoot, { force: true, recursive: true }));

    await cp(root, temporaryRoot, {
      filter(source) {
        const relative = path.relative(root, source);
        if (!relative) return true;
        return !omittedTopLevelEntries.has(relative.split(path.sep, 1)[0]);
      },
      recursive: true,
    });
    await symlink(
      path.join(root, "node_modules"),
      path.join(temporaryRoot, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );

    assert.equal(await pathExists(path.join(temporaryRoot, ".openai")), false);
    assert.equal(await pathExists(path.join(temporaryRoot, "worker")), false);

    for (const staleOutput of [
      path.join(temporaryRoot, "dist", "server", "stale.txt"),
      path.join(temporaryRoot, "dist", ".openai", "stale.txt"),
    ]) {
      await mkdir(path.dirname(staleOutput), { recursive: true });
      await writeFile(staleOutput, "stale adapter output\n", "utf8");
    }

    try {
      await execFileAsync(npmCommand, ["run", "build"], {
        cwd: temporaryRoot,
        env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      assert.fail(`Portable build failed:\n${error.stdout ?? ""}\n${error.stderr ?? ""}`);
    }

    const portable = path.join(temporaryRoot, "dist", "client");
    const rootShell = await readFile(path.join(portable, "index.html"));
    for (const relative of [
      "index.html",
      "guides/index.html",
      ...guides.map((guide) => `guides/${guide.slug}/index.html`),
      "downloads/patent-drafting-practice-library-expanded.zip",
    ]) {
      await access(path.join(portable, relative));
    }
    for (const relative of [
      "guides/index.html",
      ...guides.map((guide) => `guides/${guide.slug}/index.html`),
    ]) {
      assert.deepEqual(await readFile(path.join(portable, relative)), rootShell);
    }

    const assets = await readdir(path.join(portable, "assets"));
    assert.ok(assets.some((asset) => asset.endsWith(".js")), "portable build includes JavaScript");
    assert.ok(assets.some((asset) => asset.endsWith(".css")), "portable build includes CSS");
    assert.ok(assets.some((asset) => asset.endsWith(".woff2")), "portable build includes fonts");
    assert.equal(await pathExists(path.join(temporaryRoot, "dist", "server")), false);
    assert.equal(await pathExists(path.join(temporaryRoot, "dist", ".openai")), false);
    await assertProviderNeutral(await textFiles(portable), portable);

    const nginxConfig = await readFile(
      path.join(temporaryRoot, "deploy", "nginx.conf.example"),
      "utf8",
    );
    assert.match(nginxConfig, /root\s+\/srv\/scopecraft\/dist\/client;/u);
    assert.match(nginxConfig, /try_files\s+\$uri\s+\$uri\/\s+@scopecraft_app;/u);
    assert.match(
      nginxConfig,
      /location\s+\^~\s+\/assets\/\s*\{[\s\S]*?try_files\s+\$uri\s+=404;/u,
    );
    assert.match(
      nginxConfig,
      /location\s+\^~\s+\/downloads\/\s*\{[\s\S]*?try_files\s+\$uri\s+=404;/u,
    );
    assert.match(nginxConfig, /\$request_method\s+!~\s+\^\(GET\|HEAD\)\$/u);
    assert.match(
      nginxConfig,
      /location\s+@scopecraft_app\s*\{[\s\S]*?\$http_accept\s+!~\*\s+"text\/html"[\s\S]*?rewrite\s+\^\s+\/index\.html\s+last;/u,
    );

    const nginx = await startNginxContractServer(portable);
    t.after(nginx.close);
    for (const route of [
      "/",
      "/guides/",
      "/guides",
      "/guides/dependent-claims",
      "/guides/dependent-claims/",
      "/guides/dependent-claims/?source=direct",
      "/flow/step-two?source=share",
    ]) {
      const response = await fetch(`${nginx.baseUrl}${route}`, {
        headers: { accept: "text/html" },
      });
      assert.equal(response.status, 200, `${route} serves through the Nginx routing contract`);
      assert.match(await response.text(), /<div id="root"><\/div>/u);
    }
    const missingNonHtmlRoute = await fetch(`${nginx.baseUrl}/api/missing`, {
      headers: { accept: "application/json" },
    });
    assert.equal(missingNonHtmlRoute.status, 404);
    const missingAsset = await fetch(`${nginx.baseUrl}/assets/missing.js`);
    assert.equal(missingAsset.status, 404);
    const missingDownload = await fetch(`${nginx.baseUrl}/downloads/missing.zip`);
    assert.equal(missingDownload.status, 404);
    const writeRequest = await fetch(`${nginx.baseUrl}/flow/step-two`, { method: "POST" });
    assert.equal(writeRequest.status, 405);
    const download = await fetch(
      `${nginx.baseUrl}/downloads/patent-drafting-practice-library-expanded.zip`,
    );
    assert.equal(download.status, 200);
    assert.ok((await download.arrayBuffer()).byteLength > 0);

    for (const extension of [".js", ".css"]) {
      const asset = assets.find((name) => name.endsWith(extension));
      const expected = await readFile(path.join(portable, "assets", asset));
      const response = await fetch(`${nginx.baseUrl}/assets/${asset}`);
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-type"),
        extension === ".js" ? /javascript/u : /text\/css/u,
      );
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    }
  },
);

test("keeps provider-specific APIs and identifiers out of client build inputs", async () => {
  const clientInputs = [
    ...(await textFiles(path.join(root, "src"))),
    path.join(root, "index.html"),
    path.join(root, "vite.config.mjs"),
    path.join(root, "scripts", "clean-build.mjs"),
    path.join(root, "scripts", "prepare-static-build.mjs"),
  ];
  await assertProviderNeutral(clientInputs, root);

  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.doesNotMatch(packageJson.scripts.build, /(?:openai|sites|worker)/iu);
  const directPackages = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  });
  const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  const installedPackages = Object.keys(packageLock.packages ?? {}).flatMap((location) => {
    const marker = "node_modules/";
    const markerIndex = location.lastIndexOf(marker);
    return markerIndex === -1 ? [] : [location.slice(markerIndex + marker.length)];
  });
  for (const dependency of new Set([...directPackages, ...installedPackages])) {
    for (const pattern of forbiddenRuntimePackages) {
      assert.doesNotMatch(dependency, pattern, `provider runtime dependency: ${dependency}`);
    }
  }

  assert.equal((await lstat(path.join(root, "src"))).isDirectory(), true);
});
