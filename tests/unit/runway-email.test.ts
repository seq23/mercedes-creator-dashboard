// The runway ("Time to dump") email: the daily lane sends it while the runway is low, at most
// every TIME_TO_DUMP_REPEAT_DAYS; "Send me the runway email now" (Settings, POST
// /api/settings/email/runway-now) sends it once regardless. 26 Sep 2026: production (open mode,
// no login-code email) had no on-demand send at all, so a sender change could not be proven.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runwayEmail } from "@worker/crons/daily";
import type { Env } from "@worker/env";
import { sqliteD1 } from "./helpers/sqlite-d1";

let env: Env;
let raw: ReturnType<typeof sqliteD1>["raw"];
const sent = () => raw.prepare("SELECT kind, to_email, provider_id FROM emails_sent ORDER BY sent_at").all() as { kind: string; to_email: string; provider_id: string | null }[];

beforeEach(() => {
  const d = sqliteD1();
  raw = d.raw;
  env = { DB: d.DB, FAKE_SERVICES: "0", RESEND_API_KEY: "re_test", GITHUB_DISPATCH_TOKEN: "x", OWNER_EMAIL: "mercasare.social@gmail.com", PUBLIC_BASE_URL: "https://e.test", EMAIL_FROM: "Mercedes Studio <studio@justbeingmercedes.com>" } as unknown as Env;
});
afterEach(() => vi.unstubAllGlobals());

describe("runway email", () => {
  it("the daily lane sends once per repeat window; 'now' sends again regardless, to the notify addresses, from EMAIL_FROM", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "em_runway" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    // 0 approved clips: the runway is low, so the lane sends.
    expect(await runwayEmail(env, false)).toEqual({ sent: true, to: ["mercasare.social@gmail.com"], providerId: "em_runway" });
    // Same day again: the lane holds (repeat window), nothing new is sent.
    expect(await runwayEmail(env, false)).toEqual({ sent: false, to: ["mercasare.social@gmail.com"], providerId: null });
    expect(sent()).toHaveLength(1);
    // "Now" sends anyway, the real email, kind time_to_dump.
    const now = await runwayEmail(env, true);
    expect(now).toEqual({ sent: true, to: ["mercasare.social@gmail.com"], providerId: "em_runway" });
    expect(sent()).toEqual([
      { kind: "time_to_dump", to_email: "mercasare.social@gmail.com", provider_id: "em_runway" },
      { kind: "time_to_dump", to_email: "mercasare.social@gmail.com", provider_id: "em_runway" },
    ]);
    const body = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body)) as { from: string; to: string[]; subject: string };
    expect(body.from).toBe("Mercedes Studio <studio@justbeingmercedes.com>");
    expect(body.to).toEqual(["mercasare.social@gmail.com"]);
    expect(body.subject).toMatch(/Time to dump/);
    expect(raw.prepare("SELECT light FROM health WHERE name = 'Email (Resend)'").get()).toEqual({ light: "green" });
  });

  it("a refused send reports sent:false with no id and the Email light goes red with the reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })));
    const r = await runwayEmail(env, true);
    expect(r.sent).toBe(false);
    expect(r.providerId).toBeNull();
    expect(raw.prepare("SELECT light, fix_guide FROM health WHERE name = 'Email (Resend)'").get()).toEqual({ light: "red", fix_guide: "connect-resend" });
  });
});
