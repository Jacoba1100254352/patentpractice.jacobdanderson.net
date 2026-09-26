const RAW_CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/u;

export const APPROVED_PUBLIC_URL_HOSTS = Object.freeze({
  artifact: Object.freeze([
    "patentpractice.jacobdanderson.net",
    "patents.google.com",
    "react.dev",
    "uscode.house.gov",
    "www.uspto.gov",
    "www.w3.org",
  ]),
  challenge: Object.freeze(["patents.google.com"]),
  guide: Object.freeze(["uscode.house.gov", "www.uspto.gov"]),
  practiceLibrary: Object.freeze(["www.uspto.gov"]),
});

/**
 * Parses a reviewed public URL once and returns its canonical href.
 *
 * Raw control characters and backslashes are rejected before WHATWG parsing so
 * parser preprocessing cannot turn a visually approved prefix into a different
 * authority. Callers provide the exact hostname allowlist for their boundary.
 */
export function approvedHttpsUrl(
  value,
  {
    approvedHosts,
    label = "Public URL",
  } = {},
) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${label} must be a non-empty canonical URL string.`);
  }
  if (RAW_CONTROL_OR_BACKSLASH.test(value)) {
    throw new TypeError(`${label} must not contain control characters or backslashes.`);
  }
  if (!Array.isArray(approvedHosts) || approvedHosts.length === 0) {
    throw new TypeError(`${label} requires an explicit hostname allowlist.`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an absolute URL.`);
  }

  if (parsed.protocol !== "https:") {
    throw new TypeError(`${label} must use HTTPS.`);
  }
  if (parsed.username || parsed.password) {
    throw new TypeError(`${label} must not contain URL credentials.`);
  }
  if (parsed.port) {
    throw new TypeError(`${label} must not use a non-default port.`);
  }
  if (!approvedHosts.includes(parsed.hostname)) {
    throw new TypeError(`${label} uses an unapproved hostname: ${parsed.hostname || "<empty>"}.`);
  }
  if (parsed.href !== value) {
    throw new TypeError(`${label} must use its canonical serialized form.`);
  }

  return parsed.href;
}
