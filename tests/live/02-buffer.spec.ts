// Checklist 2: the client's own Buffer is connected on Connect. The app checks it live
// ("Check again") and every channel she added comes back green. The channels are read from
// staging at run time (`clientBuffer`): a named stop when she has not connected Buffer, or when
// the connection is the owner's shared account. This suite never pastes a key: the client
// pastes her own on Connect.
// (The Phase 0 test run on the owner's test channels finished 7 Nov 2026; those channels were
// removed from Buffer.)
import { expect, test } from "@playwright/test";
import { clientBuffer, d1, evidence, shot } from "./helpers";

const LABEL: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

test("2 · the client's Buffer is connected: every channel she added found, all green", async ({ page }) => {
  const before = clientBuffer(); // named stop before any click
  await page.goto("/settings/connections");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Buffer", exact: true }) });
  const again = card.getByRole("button", { name: "Check again" });
  await expect(again).toBeVisible();
  await again.click();
  await expect(page.getByText("Still working.")).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText("Connected");

  const { organization_id, channels } = clientBuffer(); // re-read after the live check
  expect(organization_id).toBe(before.organization_id);
  const list = page.locator(".card", { hasText: "Channels we found in your Buffer" });
  for (const c of channels) {
    const label = LABEL[c.platform];
    expect(label, `a channel on a platform this dashboard does not post to: ${c.platform}`).toBeDefined();
    await expect(list.locator(".list-row", { hasText: label! })).toContainText(`${c.handle} · posting OK`);
  }
  // a platform she has not added says so, with the way to add it; nothing else does
  const missing = Object.keys(LABEL).filter((p) => !channels.some((c) => c.platform === p));
  for (const p of missing) await expect(list.locator(".list-row", { hasText: LABEL[p]! })).toContainText("Not added in Buffer yet");
  await expect(list.locator(".list-row", { hasText: "Not added in Buffer yet" })).toHaveCount(missing.length);
  await expect(list).not.toContainText("Needs reconnect in Buffer");
  const file = await shot(page, "02-buffer-channels", { fullPage: true });

  const [conn] = d1<{ status: string; last_ok_at: string }>("SELECT status, last_ok_at FROM connections WHERE service = 'buffer'");
  expect(conn?.status).toBe("ok");
  expect(channels.every((c) => c.connected && !c.paused)).toBe(true);
  evidence("2-buffer", { screenshot: file, organization_id, channels: channels.length, last_ok_at: conn!.last_ok_at });
});
