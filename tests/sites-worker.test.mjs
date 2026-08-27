import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../dist/server/index.js";

import { guides } from "../src/guides/catalog.js";

const expectedSecurityHeaders = {
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

function assertSecurityHeaders(response) {
  for (const [name, value] of Object.entries(expectedSecurityHeaders)) {
    assert.equal(response.headers.get(name), value, `${name} is applied`);
  }
}

test("serves existing hashed assets with immutable caching and upstream metadata", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app-AbCd1234.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", {
          headers: {
            "Cache-Control": "public, max-age=0",
            "Content-Type": "text/javascript; charset=utf-8",
            ETag: '"asset-version"',
          },
          status: 200,
        });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "asset");
  assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(response.headers.get("etag"), '"asset-version"');
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assertSecurityHeaders(response);
  assert.deepEqual(calls, ["/assets/app-AbCd1234.js"]);
});

test("does not assign immutable caching to an unhashed asset name", async () => {
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async () =>
        new Response("asset", {
          headers: { "Cache-Control": "public, max-age=0" },
          status: 200,
        }),
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=0");
  assertSecurityHeaders(response);
});

for (const initialStatus of [404, 307]) {
  test(`falls back to index.html when the asset service returns ${initialStatus}`, async () => {
    const calls = [];
    const response = await worker.fetch(
      new Request("https://example.test/flow/step-two?source=share", {
        headers: { accept: "text/html,application/xhtml+xml" },
      }),
      {
        ASSETS: {
          fetch: async (request) => {
            const url = new URL(request.url);
            calls.push(url.pathname + url.search);
            if (url.pathname === "/index.html") {
              return new Response("app", {
                headers: { "Content-Type": "text/html; charset=utf-8", Vary: "Origin" },
                status: 200,
              });
            }
            return new Response(initialStatus === 404 ? "missing" : null, {
              headers: initialStatus === 307 ? { Location: "/" } : undefined,
              status: initialStatus,
            });
          },
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "app");
    assert.equal(response.headers.get("cache-control"), "no-cache");
    assert.equal(response.headers.get("vary"), "Origin, Accept");
    assertSecurityHeaders(response);
    assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
  });
}

test("serves a direct drafting-guide route through the app shell", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/guides/dependent-claims", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-cache");
  assertSecurityHeaders(response);
  assert.deepEqual(calls, ["/guides/dependent-claims", "/index.html"]);
});

test("rejects private paths before consulting the public asset service", async () => {
  for (const pathname of [
    "/.env",
    "/%252eenv",
    "/%25252eenv",
    "/%252573rc/App.jsx",
    "/%25252eopenai/hosting.json",
    "/package.json",
    "/src/App.jsx",
    "/scripts/clean-build.mjs",
    "/api/missing",
  ]) {
    let calls = 0;
    const response = await worker.fetch(new Request(`https://example.test${pathname}`), {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("unexpected", { status: 200 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assertSecurityHeaders(response);
    assert.equal(calls, 0);
  }
});

test("does not turn a missing file-like path into the app shell", async () => {
  for (const [pathname, assetStatus] of [
    ["/random.xyz", 307],
    ["/assets/missing.js", 404],
    ["/downloads/missing.zip", 404],
  ]) {
    let calls = 0;
    const response = await worker.fetch(
      new Request(`https://example.test${pathname}`, { headers: { accept: "text/html" } }),
      {
        ASSETS: {
          fetch: async () => {
            calls += 1;
            return new Response(assetStatus === 404 ? "missing" : null, {
              headers: assetStatus === 307 ? { Location: "/" } : undefined,
              status: assetStatus,
            });
          },
        },
      },
    );

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
    assertSecurityHeaders(response);
  }
});

test("rejects all write methods before consulting the public asset service", async () => {
  for (const pathname of ["/flow", "/assets/app.js", "/downloads/library.zip"]) {
    let calls = 0;
    const response = await worker.fetch(
      new Request(`https://example.test${pathname}`, { method: "POST" }),
      {
        ASSETS: {
          fetch: async () => {
            calls += 1;
            return new Response("unexpected", { status: 200 });
          },
        },
      },
    );

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assertSecurityHeaders(response);
    assert.equal(calls, 0);
  }
});

test("serves stable downloads without caching them across releases", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.test/downloads/patent-drafting-practice-library-expanded.zip",
    ),
    {
      ASSETS: {
        fetch: async () =>
          new Response("zip", { headers: { "Content-Type": "application/zip" }, status: 200 }),
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-cache");
  assertSecurityHeaders(response);
});

test("preserves HEAD metadata without returning a response body", async () => {
  const response = await worker.fetch(new Request("https://example.test/assets/app-AbCd1234.js", { method: "HEAD" }), {
    ASSETS: {
      fetch: async () =>
        new Response("asset body", {
          headers: { "Content-Type": "text/javascript", ETag: '"head-version"' },
          status: 200,
        }),
    },
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("etag"), '"head-version"');
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assertSecurityHeaders(response);
});

test("emits the optional files required by Sites packaging", async () => {
  const rootShell = await readFile(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/client/guides/index.html", import.meta.url));
  assert.deepEqual(
    await readFile(new URL("../dist/client/guides/index.html", import.meta.url)),
    rootShell,
  );
  for (const guide of guides) {
    const guideShell = new URL(`../dist/client/guides/${guide.slug}/index.html`, import.meta.url);
    await access(guideShell);
    assert.deepEqual(await readFile(guideShell), rootShell);
  }
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
  await access(
    new URL(
      "../dist/client/downloads/patent-drafting-practice-library-expanded.zip",
      import.meta.url,
    ),
  );

  assert.equal(
    await readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
    await readFile(new URL("../worker/index.js", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    JSON.parse(await readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8")),
    JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8")),
  );
});
