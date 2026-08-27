const safeMethods = new Set(["GET", "HEAD"]);
const privateRootEntries = new Set([
  ".ai-work",
  ".env",
  ".git",
  ".github",
  ".node-version",
  ".nvmrc",
  ".openai",
  "agents.md",
  "api",
  "data",
  "deploy",
  "node_modules",
  "ops",
  "package-lock.json",
  "package.json",
  "public",
  "readme.md",
  "scripts",
  "src",
  "tests",
  "vite.config.mjs",
  "vitest.config.js",
  "worker",
]);
const securityHeaders = {
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function decodePathname(pathname) {
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

function isPrivatePath(pathname) {
  const decoded = decodePathname(pathname);
  if (decoded === null || decoded.includes("\0")) return true;
  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === ".." || segment.startsWith("."))) {
    return true;
  }
  return segments.length > 0 && privateRootEntries.has(segments[0].toLowerCase());
}

function looksLikeFile(pathname) {
  const decoded = decodePathname(pathname);
  return decoded !== null && /(?:^|\/)[^/]+\.[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(decoded);
}

function isImmutableAsset(pathname) {
  return /^\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9_-]{8}\.(?:css|ico|jpe?g|js|png|svg|webp|woff2?)$/u.test(
    pathname,
  );
}

function redirectsToRoot(response, requestUrl) {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get("location");
  if (!location) return false;
  try {
    return new URL(location, requestUrl).pathname === "/";
  } catch {
    return false;
  }
}

function appendVary(headers, value) {
  const current = headers.get("Vary");
  if (current === "*") return;
  const values = current
    ? current
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) values.push(value);
  headers.set("Vary", values.join(", "));
}

function securedResponse(response, request, { requestUrl, fallback = false } = {}) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);

  const url = requestUrl ?? new URL(request.url);
  if (response.ok && isImmutableAsset(url.pathname)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (
    response.ok &&
    (fallback ||
      url.pathname.startsWith("/downloads/") ||
      headers.get("Content-Type")?.toLowerCase().includes("text/html"))
  ) {
    headers.set("Cache-Control", "no-cache");
  }
  if (fallback) appendVary(headers, "Accept");

  return new Response(request.method === "HEAD" ? null : response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function plainResponse(request, status, message, extraHeaders = {}) {
  return securedResponse(
    new Response(request.method === "HEAD" ? null : message, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        ...extraHeaders,
      },
      status,
    }),
    request,
  );
}

export default {
  async fetch(request, env) {
    if (!safeMethods.has(request.method)) {
      return plainResponse(request, 405, "Method not allowed", { Allow: "GET, HEAD" });
    }

    const requestUrl = new URL(request.url);
    if (isPrivatePath(requestUrl.pathname)) return plainResponse(request, 404, "Not found");

    const response = await env.ASSETS.fetch(request);
    const fileLike = looksLikeFile(requestUrl.pathname);
    const rootRedirect = redirectsToRoot(response, requestUrl);
    if (fileLike && (response.status === 404 || rootRedirect)) {
      return plainResponse(request, 404, "Not found");
    }

    const acceptsHtml = /(?:^|,)\s*text\/html(?:\s*;|,|$)/iu.test(
      request.headers.get("accept") ?? "",
    );
    if ((response.status !== 404 && !rootRedirect) || !acceptsHtml) {
      return securedResponse(response, request, { requestUrl });
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    const fallback = await env.ASSETS.fetch(new Request(indexUrl, request));
    return securedResponse(fallback, request, { requestUrl, fallback: true });
  },
};
