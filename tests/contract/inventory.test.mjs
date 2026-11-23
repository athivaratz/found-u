import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DATABASE_EXPORTS, HANDLER_COUNT, handlers } from "./catalog.mjs";

const contract = readFileSync(new URL("../../docs/php-port/contract.md", import.meta.url), "utf8");
const findings = readFileSync(new URL("../../docs/php-port/findings.md", import.meta.url), "utf8");

test("handler catalog matches the documented count", () => {
  assert.equal(handlers.length, HANDLER_COUNT);
  assert.equal(handlers.length, 71);
  const keys = new Set(handlers.map((row) => `${row.method} ${row.path}`));
  assert.equal(keys.size, handlers.length);
});

test("every catalog path is mentioned in the contract", () => {
  for (const row of handlers) {
    const needle = row.path.replace(":id", ":id").replace(":discordUserId", ":discordUserId");
    assert.match(contract, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("database export list is the 65 names in lib/database.ts", () => {
  assert.equal(DATABASE_EXPORTS.length, 65);
  const source = readFileSync(new URL("../../lib/database.ts", import.meta.url), "utf8");
  for (const name of DATABASE_EXPORTS) {
    assert.match(source, new RegExp(`export (async )?(function|const|type|interface) ${name}\\b`));
  }
});

test("contract and findings name the host limits the plan replaces", () => {
  for (const word of ["Realtime", "stream", "middleware", "Server Action", "edge", "VisperHost"]) {
    assert.match(contract, new RegExp(word, "i"));
    assert.match(findings, new RegExp(word, "i"));
  }
});
