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
const npmInvocation = process.env.npm_execpath
  ? { arguments: [process.env.npm_execpath], command: process.execPath }
  : { arguments: [], command: process.platform === "win32" ? "npm.cmd" : "npm" };
const omittedTopLevelEntries = new Set([
  ".ai-work",
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
const expectedSecurityHeaders = {
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};
const privateRootEntries = new Set([
  "api",
  "data",
  "deploy",
  "node_modules",
  "ops",
  "public",
  "scripts",
  "src",
  "test",
  "tests",
  "worker",
]);

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

function assertSecurityHeaders(response) {
  for (const [name, value] of Object.entries(expectedSecurityHeaders)) {
    assert.equal(response.headers.get(name), value, `${name} is applied`);
  }
}

function decodeContractPath(pathname) {
  let decoded = pathname;
  try {
    for (let pass = 0; pass < 8; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    if (decodeURIComponent(decoded) !== decoded) return null;
  } catch {
    return null;
  }
  return decoded.replaceAll("\\", "/");
}

function isPrivateContractPath(pathname) {
  const decoded = decodeContractPath(pathname);
  if (decoded === null) return true;
  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) return true;
  if (segments.length === 0) return false;
  if (privateRootEntries.has(segments[0].toLowerCase())) return true;
  return /^(?:AGENTS\.md|README(?:\.[^/]+)?|package(?:-lock)?\.json|vite\.config\.[^/]+|vitest\.config\.[^/]+)$/iu.test(
    segments.join("/"),
  );
}

function nginxContractHeaders(pathname, contentType, status = 200) {
  const immutableAsset = /^\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9_-]{8}\.(?:css|ico|jpe?g|js|png|svg|webp|woff2?)$/u.test(
    pathname,
  );
  return {
    ...expectedSecurityHeaders,
    "cache-control": [404, 405].includes(status)
      ? "no-store"
      : immutableAsset
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    ...(contentType.includes("text/html") ? { vary: "Accept" } : {}),
  };
}

async function startNginxContractServer(portable) {
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const candidate = path.resolve(portable, `.${pathname}`);
      const decodedPathname = decodeContractPath(pathname);
      const insidePortable =
        candidate === portable || candidate.startsWith(`${portable}${path.sep}`);
      const isAssetRequest = pathname.startsWith("/assets/");
      const isDownloadRequest = pathname.startsWith("/downloads/");
      const isFileRequest = decodedPathname !== null
        && /(?:^|\/)[^/]+\.[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(decodedPathname);
      const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;

      if (!["GET", "HEAD"].includes(request.method)) {
        response
          .writeHead(405, nginxContractHeaders(pathname, "text/plain; charset=utf-8", 405))
          .end("method not allowed");
        return;
      }

      if (isPrivateContractPath(pathname)) {
        response.writeHead(404, nginxContractHeaders(pathname, "text/plain; charset=utf-8", 404));
        response.end(request.method === "HEAD" ? undefined : "not found");
        return;
      }

      const candidates = insidePortable
        ? [
            candidate,
            path.join(candidate, "index.html"),
            ...(!isAssetRequest && !isDownloadRequest && !isFileRequest && acceptsHtml
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
        response.writeHead(404, nginxContractHeaders(pathname, "text/plain; charset=utf-8", 404));
        response.end(request.method === "HEAD" ? undefined : "not found");
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
        ...nginxContractHeaders(pathname, contentTypes[path.extname(selected)] ?? "application/octet-stream"),
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
      await execFileAsync(npmInvocation.command, [...npmInvocation.arguments, "run", "build"], {
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
      /map\s+"\$status:\$uri"\s+\$scopecraft_cache_control\s*\{[\s\S]*?max-age=31536000, immutable/u,
    );
    assert.match(
      nginxConfig,
      /map\s+\$sent_http_content_type\s+\$scopecraft_vary\s*\{[\s\S]*?text\/html\s+"Accept"/u,
    );
    for (const [header, value] of [
      ["Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()"],
      ["Referrer-Policy", "strict-origin-when-cross-origin"],
      ["X-Content-Type-Options", "nosniff"],
      ["X-Frame-Options", "DENY"],
    ]) {
      assert.match(
        nginxConfig,
        new RegExp(`add_header\\s+${header}\\s+"?${value.replace(/[()]/gu, "\\$&")}"?\\s+always;`, "u"),
      );
    }
    assert.match(nginxConfig, /location\s+~\s+\(\^\|\/\)\\\./u);
    assert.match(nginxConfig, /location\s+~\*\s+"%\[0-9a-f\]\[0-9a-f\]"/u);
    assert.match(nginxConfig, /location\s+~\*\s+\/\[\^\/\]\+\\\./u);
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
      assert.equal(response.headers.get("cache-control"), "no-cache");
      assert.equal(response.headers.get("vary"), "Accept");
      assertSecurityHeaders(response);
      assert.match(await response.text(), /<div id="root"><\/div>/u);
    }
    const missingNonHtmlRoute = await fetch(`${nginx.baseUrl}/api/missing`, {
      headers: { accept: "application/json" },
    });
    assert.equal(missingNonHtmlRoute.status, 404);
    assertSecurityHeaders(missingNonHtmlRoute);
    for (const route of [
      "/.env",
      "/%252eenv",
      "/%25252eenv",
      "/package.json",
      "/src/App.jsx",
      "/src%252fApp.jsx",
      "/%252573rc/App.jsx",
      "/random.xyz",
      "/random%252exyz",
    ]) {
      const response = await fetch(`${nginx.baseUrl}${route}`, {
        headers: { accept: "text/html" },
      });
      assert.equal(response.status, 404, `${route} never falls through to the app shell`);
      assertSecurityHeaders(response);
    }
    const missingAsset = await fetch(`${nginx.baseUrl}/assets/missing.js`);
    assert.equal(missingAsset.status, 404);
    assert.equal(missingAsset.headers.get("cache-control"), "no-store");
    assertSecurityHeaders(missingAsset);
    const missingDownload = await fetch(`${nginx.baseUrl}/downloads/missing.zip`);
    assert.equal(missingDownload.status, 404);
    assert.equal(missingDownload.headers.get("cache-control"), "no-store");
    assertSecurityHeaders(missingDownload);
    for (const route of ["/flow/step-two", "/assets/missing.js", "/downloads/missing.zip"]) {
      const writeRequest = await fetch(`${nginx.baseUrl}${route}`, { method: "POST" });
      assert.equal(writeRequest.status, 405, `${route} rejects write methods`);
      assert.equal(writeRequest.headers.get("cache-control"), "no-store");
      assertSecurityHeaders(writeRequest);
    }
    const download = await fetch(
      `${nginx.baseUrl}/downloads/patent-drafting-practice-library-expanded.zip`,
    );
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("cache-control"), "no-cache");
    assertSecurityHeaders(download);
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
      assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
      assertSecurityHeaders(response);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    }

    const headResponse = await fetch(`${nginx.baseUrl}/`, {
      headers: { accept: "text/html" },
      method: "HEAD",
    });
    assert.equal(headResponse.status, 200);
    assert.equal(await headResponse.text(), "");
    assertSecurityHeaders(headResponse);
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
  assert.match(packageJson.scripts.build, /npm run challenges:check/u);
  assert.match(packageJson.scripts.build, /node scripts\/verify-client-artifact\.mjs$/u);
  assert.equal(packageJson.packageManager, "npm@12.0.2");
  assert.deepEqual(packageJson.engines, { node: "24.18.1", npm: "12.0.2" });
  assert.equal((await readFile(path.join(root, ".node-version"), "utf8")).trim(), "24.18.1");
  assert.equal((await readFile(path.join(root, ".nvmrc"), "utf8")).trim(), "24.18.1");
  const directPackages = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  });
  const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  assert.deepEqual(packageLock.packages[""].engines, { node: "24.18.1", npm: "12.0.2" });
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
