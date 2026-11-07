// Helpers for the live staging suite. Secrets come from the vault through its own Keychain
// adapter in a child process (no-prompt mode) and are held in memory only: never printed,
// never on a command line, never written to disk.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const OWNER = process.env.LIVE_OWNER_EMAIL ?? "sequoia@westpeek.ventures";
export const STAGING_DB = "mercedes-creator-dashboard-db-staging";
const EVIDENCE_DIR = "docs/design/live";
const EVIDENCE_FILE = path.join(EVIDENCE_DIR, "evidence.json");

const VAULT_READ = `
import sys
from repo_operator.vault import keychain as kc
v = kc.get().get(sys.argv[1], kc.owner_account())
sys.stdout.write(v or "")
`;

const vaultCache = new Map<string, string>();
/**
 * A vault credential by its id (e.g. `sheila-resend-api-key`), read from the Keychain service the
 * vault RECORDS for it (`vault inspect` → KEYCHAIN SERVICE); ids do not all follow one pattern
 * (`openrouter-ai-c4dc6108` lives under `repo-operator-provider-openrouter`).
 */
export function vaultSecret(id: string): string {
  // The owner's own Buffer account (its key is vault `buffer-access-token`) held the Phase 0 test
  // channels until 7 Nov 2026 and now holds another business's channels. Nothing here reads it.
  if (RETIRED_VAULT_IDS.has(id)) throw new Error(`SHARED_BUFFER_KEY: vault ${id} belongs to the owner's shared Buffer account; this client's live suite never uses it`);
  const hit = vaultCache.get(id);
  if (hit) return hit;
  const cwd = `${process.env.HOME}/repo-tools/agent`;
  const inspect = execFileSync("python3", ["-m", "repo_operator.cli", "vault", "inspect", id], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20_000 });
  const service = inspect.match(/^KEYCHAIN SERVICE\s+(\S+)/m)?.[1];
  if (!service) throw new Error(`the vault records no Keychain service for ${id}`);
  const v = execFileSync("python3", ["-c", VAULT_READ, service], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20_000 }).trim();
  if (!v) throw new Error(`the vault has no value for ${id}`);
  vaultCache.set(id, v);
  return v;
}

export interface ResendEmail {
  id: string;
  subject: string;
  created_at: string;
  last_event: string | null;
  to: string[];
  text?: string | null;
  html?: string | null;
}

async function resend<T>(p: string): Promise<T> {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`https://api.resend.com${p}`, { headers: { Authorization: `Bearer ${vaultSecret("sheila-resend-api-key")}` } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (!res.ok) throw new Error(`Resend answered ${res.status} for ${p.split("?")[0]}`);
    return (await res.json()) as T;
  }
  throw new Error("Resend kept answering 429");
}

/** Resend writes "2026-09-25 23:58:57.276000+00". */
export function resendTime(s: string): number {
  return Date.parse(s.replace(" ", "T").replace(/\+00$/, "Z"));
}

/** Newest email to the owner whose subject matches, sent at or after `sinceMs`; polls until found. */
export async function waitForEmail(subject: RegExp, sinceMs: number, timeoutMs = 90_000): Promise<ResendEmail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await resend<{ data: ResendEmail[] }>("/emails?limit=20");
    const hit = list.data.find((e) => subject.test(e.subject) && resendTime(e.created_at) >= sinceMs && e.to.includes(OWNER));
    if (hit) return resend<ResendEmail>(`/emails/${hit.id}`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`no email matching ${subject} since ${new Date(sinceMs).toISOString()}`);
}

/** All owner emails matching the subject since a time (for "sent exactly once" checks). */
export async function emailsSince(subject: RegExp, sinceMs: number): Promise<ResendEmail[]> {
  const list = await resend<{ data: ResendEmail[] }>("/emails?limit=50");
  return list.data.filter((e) => subject.test(e.subject) && resendTime(e.created_at) >= sinceMs);
}

/** Read-only SQL against the staging D1 (setup, evidence and cleanup checks only). */
export function d1<T = Record<string, unknown>>(sql: string): T[] {
  // wrangler's remote call fails now and then on the network (7c lost 25 minutes to one blip):
  // three tries, then the error.
  for (let attempt = 1; ; attempt++) {
    try {
      const out = execFileSync("npx", ["wrangler", "d1", "execute", STAGING_DB, "--remote", "--env", "staging", "--json", "--command", sql], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
      });
      const parsed = JSON.parse(out) as { results: T[] }[];
      return parsed[parsed.length - 1]?.results ?? [];
    } catch (e) {
      if (attempt >= 3) throw e;
      execFileSync("sleep", [String(5 * attempt)]);
    }
  }
}

/** The owner's shared Buffer account (Phase 0 test run, finished 7 Nov 2026). Never this client's. */
export const SHARED_BUFFER_ORG = "6a1331f15351f4a7ea38e3d5";
const RETIRED_VAULT_IDS = new Set(["buffer-access-token"]);

export interface BufferChannel { platform: string; handle: string; connected: boolean; paused?: boolean }

/**
 * The Buffer channels the client connected on Connect, read from staging at run time. A named
 * stop (never a skip) when Buffer is not connected, or when the connection is the owner's shared
 * account, so no live spec can plan, post or read on channels that are not the client's.
 */
export function clientBuffer(): { organization_id: string; channels: BufferChannel[] } {
  const [conn] = d1<{ status: string; meta: string | null }>("SELECT status, meta FROM connections WHERE service = 'buffer'");
  if (!conn || conn.status !== "ok" || !conn.meta) throw new Error("BUFFER_NOT_CONNECTED: the client has not connected her Buffer on staging's Connect screen; the Buffer live checks need her own channels");
  const meta = JSON.parse(conn.meta) as { organization_id: string; channels?: BufferChannel[] };
  if (meta.organization_id === SHARED_BUFFER_ORG) throw new Error("SHARED_BUFFER_ACCOUNT: staging is connected to the owner's shared Buffer account, not the client's; Disconnect it on Connect before any live run");
  const channels = meta.channels ?? [];
  if (!channels.length) throw new Error("BUFFER_NO_CHANNELS: the client's Buffer has no channels; add one in Buffer, then Check again on Connect");
  return { organization_id: meta.organization_id, channels };
}

/**
 * A named stop while ANY Buffer is connected on staging: for live specs that plan TEST posts,
 * which the hourly lane would hand to Buffer and publish on a real channel.
 */
export function noBufferConnected(): void {
  const [conn] = d1<{ status: string }>("SELECT status FROM connections WHERE service = 'buffer'");
  if (conn && conn.status !== "disconnected") throw new Error(`BUFFER_CONNECTED: staging has a Buffer connection (${conn.status}); this spec plans TEST posts the hourly lane would publish. Disconnect Buffer on Connect first`);
}

/** Poll a D1 query until `done` says yes (bounded). */
export async function waitForRow<T>(sql: string, done: (rows: T[]) => boolean, timeoutMs: number, everyMs = 15_000): Promise<T[]> {
  const deadline = Date.now() + timeoutMs;
  let rows: T[] = [];
  while (Date.now() < deadline) {
    rows = d1<T>(sql);
    if (done(rows)) return rows;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)} s waiting on: ${sql.slice(0, 120)}`);
}

/** Screenshot evidence, JPEG, under 300 KB, committed under docs/design/live/. */
export async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}): Promise<string> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `${name}.jpg`);
  for (const quality of [70, 50, 35]) {
    await page.screenshot({ path: file, type: "jpeg", quality, fullPage: opts.fullPage ?? false });
    if (statSync(file).size < 300_000) return file;
  }
  await page.screenshot({ path: file, type: "jpeg", quality: 35, fullPage: false });
  expect(statSync(file).size, `${file} must stay under 300 KB`).toBeLessThan(300_000);
  return file;
}

/** Merge one item's evidence into docs/design/live/evidence.json (ids, counts, run ids; never content). */
export function evidence(item: string, data: Record<string, unknown>): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const all = existsSync(EVIDENCE_FILE) ? (JSON.parse(readFileSync(EVIDENCE_FILE, "utf8")) as Record<string, Record<string, unknown>>) : {};
  all[item] = { ...(all[item] ?? {}), ...data, at: new Date().toISOString() };
  writeFileSync(EVIDENCE_FILE, `${JSON.stringify(all, null, 2)}\n`);
}

/** The newest GitHub Actions run of a job workflow started after `sinceMs`, via the gh CLI. */
export function latestRun(workflow: string, sinceMs: number): { databaseId: number; status: string; conclusion: string; createdAt: string } | null {
  const out = execFileSync("gh", ["run", "list", "--repo", "seq23/mercedes-creator-dashboard", "--workflow", workflow, "--limit", "5", "--json", "databaseId,status,conclusion,createdAt"], { encoding: "utf8" });
  const runs = JSON.parse(out) as { databaseId: number; status: string; conclusion: string; createdAt: string }[];
  return runs.find((r) => Date.parse(r.createdAt) >= sinceMs - 60_000) ?? null;
}
