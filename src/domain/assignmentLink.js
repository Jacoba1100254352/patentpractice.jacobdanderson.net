function normalizedCatalog(catalog) {
  return Array.isArray(catalog) ? catalog : [];
}

function cleanValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseAssignmentLink(search = "", catalog = []) {
  const params = new URLSearchParams(search);
  const challengeValue = cleanValue(params.get("challenge"));
  const modeValue = cleanValue(params.get("mode"));
  const requested = params.has("challenge") || params.has("mode");

  if (!requested) {
    return Object.freeze({
      status: "absent",
      requested: false,
      valid: false,
      challengeId: null,
      challengeSlug: null,
      modeId: null,
      errors: Object.freeze([]),
    });
  }

  const errors = [];
  if (!challengeValue) errors.push("The assignment link is missing a challenge.");
  if (!modeValue) errors.push("The assignment link is missing a practice mode.");

  const challenge = normalizedCatalog(catalog).find(
    (candidate) =>
      candidate?.id === challengeValue || candidate?.slug === challengeValue,
  );
  if (challengeValue && !challenge) {
    errors.push("The assignment link names a challenge that is not available.");
  }

  const availableModes = Array.isArray(challenge?.availableModes)
    ? challenge.availableModes
    : [];
  if (modeValue && challenge && !availableModes.includes(modeValue)) {
    errors.push("The assignment link names a mode that is not available for this challenge.");
  }

  if (errors.length) {
    return Object.freeze({
      status: "invalid",
      requested: true,
      valid: false,
      challengeId: challenge?.id ?? null,
      challengeSlug: challenge?.slug ?? null,
      modeId: null,
      errors: Object.freeze(errors),
    });
  }

  return Object.freeze({
    status: "valid",
    requested: true,
    valid: true,
    challengeId: challenge.id,
    challengeSlug: challenge.slug,
    modeId: modeValue,
    errors: Object.freeze([]),
  });
}

export function buildAssignmentLink({ baseUrl, challenge, modeId } = {}) {
  const slug = cleanValue(challenge?.slug);
  const availableModes = Array.isArray(challenge?.availableModes)
    ? challenge.availableModes
    : [];
  if (!slug) throw new TypeError("A challenge slug is required.");
  if (!availableModes.includes(modeId)) {
    throw new RangeError("The selected mode is not available for this challenge.");
  }

  const fallbackBase = "https://patentpractice.jacobdanderson.net/";
  const url = new URL(baseUrl || globalThis.location?.href || fallbackBase);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("challenge", slug);
  url.searchParams.set("mode", modeId);
  return url.toString();
}

export function replaceAssignmentMode(search, modeId) {
  const params = new URLSearchParams(search);
  params.set("mode", modeId);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
