#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { guides } from "../src/guides/catalog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const client = path.join(dist, "client");
const index = path.join(client, "index.html");

if (!existsSync(index)) {
  throw new Error(`Missing portable build input: ${index}`);
}

for (const route of ["guides", ...guides.map((guide) => `guides/${guide.slug}`)]) {
  const routeDirectory = path.join(client, route);
  mkdirSync(routeDirectory, { recursive: true });
  copyFileSync(index, path.join(routeDirectory, "index.html"));
}

console.log("Prepared portable static build and guide-route shells in dist/client");
