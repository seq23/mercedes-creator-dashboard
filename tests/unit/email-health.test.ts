// A refused email must never leave the health board saying "Ready to send" (found on staging,
// 25 Sep 2026: Resend's test mode refused every login code while the light stayed green and
// the login form said "check your email").
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FROM_DEFAULT, emailFrom, resendRefusal, sendEmail } from "@worker/services/email";
import { serviceHealthRows } from "@worker/crons/buffer-sync";
import type { Env } from "@worker/env";
import { sqliteD1 } from "./helpers/sqlite-d1";

const TEST_MODE = JSON.stringify({ statusCode: 403, name: "validation_error", message: "You can only send testing emails to your own email address (someone@example.com). To send emails to other recipients, please verify a domain at resend.com/domains" });
let env: Env;
let raw: ReturnType<typeof sqliteD1>["raw"];
const light = () => raw.prepare("SELECT light, note, fix_guide FROM health WHERE name = 'Email (Resend)'").get() as { light: string; note: string; fix_guide: string | null };
const mail = { kind: "login_code" as const, to: ["owner@example.com"], subject: "s", html: "h", text: "t" };

beforeEach(() => {
  const d = sqliteD1();
  raw = d.raw;
  env = { DB: d.DB, FAKE_SERVICES: "0", RESEND_API_KEY: "re_test", GITHUB_DISPATCH_TOKEN: "x", OWNER_EMAIL: "owner@example.com", PUBLIC_BASE_URL: "https://e.test" } as unknown as Env;
});
afterEach(() => vi.unstubAllGlobals());

describe("resendRefusal", () => {
  it("names test mode in plain words and never echoes the account's address", () => {
    const m = resendRefusal(403, TEST_MODE);
    expect(m).toMatch(/test mode/);
    expect(m).not.toContain("@");
    expect(resendRefusal(401, "")).toBe("Resend says this key is not valid.");
    expect(resendRefusal(500, "boom")).toBe("Resend answered 500");
  });
});

describe("Email (Resend) light follows the last real send", () => {
  it("a refused send turns it red with the reason; the daily check does not paint it green; a good send does", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(TEST_MODE, { status: 403 })));
    const r = await sendEmail(env, mail);
    expect(r.ok).toBe(false);
    expect(light()).toMatchObject({ light: "red", fix_guide: "connect-resend" });
    expect(light().note).toMatch(/not delivered: Resend is in test mode/);

    await serviceHealthRows(env);
    expect(light().light).toBe("red");
    expect(light().note).toMatch(/test mode/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 })));
    expect((await sendEmail(env, mail)).ok).toBe(true);
    expect(light()).toMatchObject({ light: "green", note: "Ready to send" });
    await serviceHealthRows(env);
    expect(light().light).toBe("green");
  });

  // 26 Sep 2026: production sent from Resend's shared onboarding@resend.dev; that sender delivers
  // only to the key's own account address, so Mercedes got nothing. EMAIL_FROM is her own domain.
  it("sends from EMAIL_FROM when set; blank or missing falls back to Resend's shared test sender", async () => {
    const sentFrom = async (e: Env) => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "em_2" }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      expect((await sendEmail(e, mail)).ok).toBe(true);
      const [url, init] = (fetchMock.mock.calls[0] as unknown as [string, RequestInit]);
      expect(url).toBe("https://api.resend.com/emails");
      return (JSON.parse(String(init.body)) as { from: string }).from;
    };
    const from = "Mercedes Studio <studio@justbeingmercedes.com>";
    expect(await sentFrom({ ...env, EMAIL_FROM: from } as Env)).toBe(from);
    expect(await sentFrom(env)).toBe(FROM_DEFAULT);
    expect(await sentFrom({ ...env, EMAIL_FROM: "  " } as Env)).toBe(FROM_DEFAULT);
    expect(FROM_DEFAULT).toBe("Mercedes Studio <onboarding@resend.dev>");
    expect(emailFrom({ EMAIL_FROM: ` ${from} ` })).toBe(from);
  });

  it("fake mode never touches the light from a send", async () => {
    env = { ...env, FAKE_SERVICES: "1" } as Env;
    await sendEmail(env, mail);
    expect(light()).toBeUndefined();
  });
});
