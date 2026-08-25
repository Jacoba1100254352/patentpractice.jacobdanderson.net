import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../dist/server/index.js";

import { guides } from "../src/guides/catalog.js";

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

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
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/guides/dependent-claims", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
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
