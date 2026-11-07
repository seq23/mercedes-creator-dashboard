// Checklist 8: Health + emails on staging, for real.
//
// The break is a REAL revoked Buffer key: the client regenerates her key in Buffer, which revokes
// the one staging holds. (The app's own Disconnect button is her choice, so it is "off", never
// "bad", and rightly sends no email; a key Buffer refuses is the failure that must email her.)
// Run `LIVE_HEALTH=break` while the stored key is dead, then 02-buffer.spec.ts proves her new key
// on Connect, then the default mode proves every light, and each channel she connected (read at
// run time; a named stop when Buffer is not connected), is green again.
import { expect, test } from "@playwright/test";
import { clientBuffer, d1, emailsSince, evidence, shot, waitForEmail } from "./helpers";

const NEEDS_YOU = /^Buffer needs you/;

test.describe.configure({ mode: "serial" });

test("8a · a Buffer key Buffer refuses: red light + one 'Buffer needs you' email", async ({ page }) => {
  test.skip(process.env.LIVE_HEALTH !== "break", "run with LIVE_HEALTH=break while the stored Buffer key is revoked");
  const since = Date.now() - 5_000;
  await page.goto("/settings");
  await page.getByRole("button", { name: "Check everything now" }).click();
  const row = page.locator('[data-health="Buffer"]');
  await expect(row).toContainText("Not working");
  await expect(row.getByRole("link", { name: "How to fix" })).toBeVisible();
  const file = await shot(page, "08-buffer-red");
  const mail = await waitForEmail(NEEDS_YOU, since);
  expect(`${mail.text}`).toMatch(/help\/reconnect-buffer/);
  // A second check while it is still broken must not email again.
  await page.getByRole("button", { name: "Check everything now" }).click();
  await expect(page.getByText("Checked everything.")).toBeVisible();
  await page.waitForTimeout(20_000);
  expect((await emailsSince(NEEDS_YOU, since)).length, "exactly one 'needs you' email per break").toBe(1);
  evidence("8-health", { red_screenshot: file, needs_you_email_id: mail.id, needs_you_emails: 1 });
});

test("8b · after reconnecting, Check everything now turns Buffer and every channel green", async ({ page }) => {
  test.skip(process.env.LIVE_HEALTH === "break", "the break half runs alone");
  const LABEL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };
  const channelLights = clientBuffer().channels.map((c) => `${LABEL[c.platform] ?? c.platform} (via Buffer)`);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Check everything now" }).click();
  await expect(page.getByText("Checked everything.")).toBeVisible();
  for (const name of ["Buffer", ...channelLights, "Email (Resend)", "Job runner (GitHub)"]) {
    await expect(page.locator(`[data-health="${name}"]`), name).toContainText("Working");
  }
  const file = await shot(page, "08-health-green", { fullPage: true });
  const names = ["Buffer", ...channelLights];
  const rows = d1<{ name: string; light: string }>(`SELECT name, light FROM health WHERE name IN ('${names.join("','")}')`);
  expect(rows.map((r) => r.name).sort()).toEqual([...names].sort());
  expect(rows.every((r) => r.light === "green")).toBe(true);
  evidence("8-health", { green_screenshot: file });
});
