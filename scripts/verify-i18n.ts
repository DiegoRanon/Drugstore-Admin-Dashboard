/**
 * Message-catalogue check.
 *
 *   npm run verify:i18n
 *
 * French is the product's source language and must be complete, not a partial
 * translation of an English-first UI (PRD 5.8). This asserts that:
 *
 *   1. every `t("…")` key used in the code exists in both catalogues, and
 *   2. the catalogues have exactly the same keys.
 *
 * It exists because a missing key does not throw at build time — it renders its
 * own name into the interface, so `nav.searchPatients` appears in a search box
 * and nobody notices until a screenshot arrives.
 *
 * Needs no server; runs anywhere.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import en from "../src/i18n/messages/en.json";
import fr from "../src/i18n/messages/fr.json";

const SRC = "src";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    return;
  }
  failed += 1;
  const suffix = detail ? `\n        ${detail}` : "";
  console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${suffix}`);
}

function flatten(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** `t("a.b")` — the statically resolvable form. */
const STATIC_KEY = /\bt\(\s*"([a-zA-Z0-9_.]+)"/g;
/** `t(`a.${x}`)` — resolvable only at runtime; reported, not failed. */
const DYNAMIC_KEY = /\bt\(\s*`([^`]*\$\{[^`]*)`/g;

function main() {
  console.log("\nMessage catalogues\n");

  const frKeys = new Set(flatten(fr));
  const enKeys = new Set(flatten(en));

  const missingInEn = [...frKeys].filter((key) => !enKeys.has(key));
  const missingInFr = [...enKeys].filter((key) => !frKeys.has(key));

  check(
    "the catalogues hold the same keys",
    missingInEn.length === 0 && missingInFr.length === 0,
    [
      missingInEn.length ? `missing in en: ${missingInEn.join(", ")}` : "",
      missingInFr.length ? `missing in fr: ${missingInFr.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n        "),
  );

  const used = new Map<string, string[]>();
  const dynamic: string[] = [];

  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, "utf8");

    for (const match of source.matchAll(STATIC_KEY)) {
      const key = match[1]!;
      used.set(key, [...(used.get(key) ?? []), file]);
    }

    for (const match of source.matchAll(DYNAMIC_KEY)) {
      dynamic.push(`${file}: t(\`${match[1]}\`)`);
    }
  }

  const unresolved = [...used.entries()].filter(([key]) => !frKeys.has(key));

  check(
    `every key used in the code resolves (${used.size} checked)`,
    unresolved.length === 0,
    unresolved
      .map(([key, files]) => `${key} — used in ${[...new Set(files)].join(", ")}`)
      .join("\n        "),
  );

  // Namespaces built at runtime (`status.${order.status}`) cannot be resolved
  // statically. They are listed so the set stays small and reviewable.
  console.log(`\n  ${dynamic.length} runtime-built key(s), not statically checkable:`);
  for (const entry of dynamic) console.log(`    ${entry}`);

  const unused = [...frKeys].filter((key) => !used.has(key));
  console.log(`\n  ${unused.length} key(s) not referenced by a literal lookup.`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
