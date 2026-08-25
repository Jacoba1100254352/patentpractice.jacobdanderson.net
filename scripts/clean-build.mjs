#!/usr/bin/env node
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

rmSync(path.join(root, "dist"), { force: true, recursive: true });
console.log("Cleaned generated build output");
