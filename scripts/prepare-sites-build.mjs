#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { guides } from "../src/guides/catalog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");
const worker = path.join(root, "worker", "index.js");
const hosting = path.join(root, ".openai", "hosting.json");

for (const file of [index, worker, hosting]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

mkdirSync(path.join(dist, "server"), { recursive: true });
mkdirSync(path.join(dist, ".openai"), { recursive: true });
copyFileSync(worker, path.join(dist, "server", "index.js"));
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));

for (const route of ["guides", ...guides.map((guide) => `guides/${guide.slug}`)]) {
  const routeDirectory = path.join(dist, "client", route);
  mkdirSync(routeDirectory, { recursive: true });
  copyFileSync(index, path.join(routeDirectory, "index.html"));
}

console.log("Prepared Sites build: server entry, hosting metadata, and guide-route shells");
