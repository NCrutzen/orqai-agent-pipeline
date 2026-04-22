import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DomainConfigSchema, type DomainConfig } from "./types.js";

const CONFIGS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "configs");

export function loadDomain(domain: string): DomainConfig {
  const path = resolve(CONFIGS_DIR, `${domain}.json`);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return DomainConfigSchema.parse(raw);
}

export function domainFromArgv(): string {
  const arg = process.argv.find((a) => a.startsWith("--domain="));
  if (!arg) throw new Error("Missing --domain=<name> argument");
  return arg.slice("--domain=".length);
}
