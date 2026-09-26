// Stand-in Research Brief for FAKE_SERVICES=1 (and the unit test that pins its shape).
// Built for Mercedes' niche from her locked Brand Profile and the section 10b baseline. It cites
// only real sources: the six 10b studies, her own profile, her stats if connected, and her
// uploads. No web search happens in fake mode, so nothing here pretends to come from one;
// claims without evidence are marked uncertain, exactly as a real brief must.
import { LAUNCH_SLOTS, PLATFORMS, PLATFORM_LABEL, type Platform } from "@shared/constants";
import type { BriefBody, BriefSource, Claim } from "@shared/types";
import { BASELINE_SOURCES } from "../domain/brief";

export interface FakeBriefInput {
  stats: Partial<Record<Platform, { videos: number }>>;
  uploads: { id: string; title: string }[];
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;

export function buildFakeBrief(input: FakeBriefInput): { body: BriefBody; sources: BriefSource[] } {
  const sources: BriefSource[] = [...BASELINE_SOURCES, { id: "her_profile", url: null, title: "Your locked Brand Profile", kind: "her_data" }];
  for (const p of PLATFORMS) {
    const s = input.stats[p];
    if (s && s.videos > 0) sources.push({ id: `her_${p}`, url: null, title: `Your ${PLATFORM_LABEL[p]} results (${s.videos} videos)`, kind: "her_data" });
  }
  for (const u of input.uploads) sources.push({ id: `up_${u.id}`, url: null, title: u.title, kind: "upload" });

  const solid = (text: string, source_ids: string[], basis: Claim["basis"]): Claim => ({ text, source_ids, basis, confidence: "solid" });
  const unsure = (text: string, source_ids: string[], basis: Claim["basis"]): Claim => ({ text, source_ids, basis, confidence: "uncertain" });
  const statIds = PLATFORMS.filter((p) => sources.some((s) => s.id === `her_${p}`)).map((p) => `her_${p}`);

  const audience: Claim[] = [
    solid("Her core audience is Black women in their 20s to 40s who love beauty and style, young professionals and city women who want the honest review.", ["her_profile"], "her_data"),
    solid("Most of them get ready fast, shop from drugstore to prestige and trust a corporate beauty insider more than a trend.", ["her_profile"], "her_data"),
    statIds.length
      ? solid("Her own results show which platform her audience watches most; the Stats page has the numbers.", statIds, "her_data")
      : unsure("Where her followers live and their age split is not known yet. Connect Instagram and YouTube stats, or upload the TikTok export, and the next refresh fills this in.", [], "her_data"),
  ];
  for (const u of input.uploads) audience.push(solid("Her uploaded report is included as a source; its claims are weighed like any other.", [`up_${u.id}`], "upload"));

  const themes = [
    { title: "Get ready with me", claims: [solid("The morning routine, the office face and the going-out look are her most visual moments and fit short vertical video.", ["her_profile"], "her_data")] },
    { title: "Honest reviews", claims: [solid("One product, the price, the result on her own skin or hair: natural 15–30 second moments with a clear verdict.", ["her_profile"], "her_data")] },
    { title: "Career and confidence", claims: [solid("What a corporate beauty job is really like gives talking-head clips with a clear takeaway.", ["her_profile"], "her_data"), unsure("Talking-head career clips may hold attention longer than outfit montages for her audience; her results will confirm it.", [], "her_data")] },
    { title: "Style on a real budget", claims: [solid("Outfit repeats, what earns its place in the closet and the city as the backdrop show the thinking behind the look and build trust with brands.", ["her_profile"], "her_data")] },
  ];

  const hooks: Claim[] = [
    solid("\"Here's what actually works…\" opening on the finished look: warm and in her voice.", ["her_profile"], "her_data"),
    solid("\"This is what Just Being Mercedes looks like\" over the mirror shot.", ["her_profile"], "her_data"),
    solid("\"If you work in beauty, you already know\" to open review and career clips.", ["her_profile"], "her_data"),
    unsure("A question hook (\"Would you wear this to the office?\") may lift comments; not tested on her account yet.", [], "her_data"),
  ];

  const cut_styles: Claim[] = [
    solid("Hook-first cuts: move the best line or the final look to second 0.", ["her_profile"], "her_data"),
    solid("Tight talking-head, 20–45 seconds, for reviews and career topics.", ["her_profile"], "her_data"),
    unsure("Montage clips of 15–30 seconds for outfits and routines; the best length for her audience is not known yet and will come from her results.", [], "her_data"),
  ];

  const timeClaim = (p: Platform, day: number, hour: number): Claim => {
    const at = `${DAY[day]} ${hourLabel(hour)}`;
    if (p === "tiktok") {
      if (day === 0 || day === 6) return unsure(`${at}: the big studies disagree on weekends (one says avoid, one ranks Saturday best), so this slot is a test.`, ["b_sprout_tt", "b_buffer_all"], "web");
      return solid(`${at}: weekday late afternoon and evening is where both big TikTok studies overlap.`, ["b_sprout_tt", "b_buffer_all"], "web");
    }
    if (p === "instagram") return solid(`${at}: Instagram evenings and Tuesday–Wednesday are strongest across 9.6M posts; Thursday mornings also do well.`, ["b_buffer_ig", "b_sprout_ig"], "web");
    return solid(`${at}: YouTube Shorts did best Friday around 4 pm, with Saturday close behind.`, ["b_buffer_all"], "web");
  };
  const best_times = {} as BriefBody["best_times"];
  for (const p of PLATFORMS) best_times[p] = LAUNCH_SLOTS[p].map((s) => ({ ...s, claim: timeClaim(p, s.day, s.hour) }));

  const comparable_creators = [
    { handle: "#nycstyle", platform: "instagram" as Platform, why: unsure("City style creators under this tag show what New York audiences respond to. No web search ran, so no individual creators are named.", [], "web") },
    { handle: "#grwm", platform: "tiktok" as Platform, why: unsure("Get-ready-with-me content under this tag is a comparison point for her routines.", [], "web") },
    { handle: "#blackgirlmagic", platform: "youtube" as Platform, why: unsure("Beauty creators under this tag speak to the same audience; worth watching for hook ideas.", [], "web") },
  ];

  const shot_list: Claim[] = [
    solid("The commute: out the door, coffee in hand, the city behind her.", ["her_profile"], "her_data"),
    solid("The product going on, close up, in one steady take.", ["her_profile"], "her_data"),
    solid("A 30-second talk to camera: one thing a corporate beauty pro would never buy.", ["her_profile"], "her_data"),
    solid("The full routine as a quick time-lapse, bare face to done.", ["her_profile"], "her_data"),
    solid("Her getting ready for a night out: the outfit, the earrings, the last look in the mirror.", ["her_profile"], "her_data"),
  ];

  return { body: { audience, themes, hooks, cut_styles, best_times, comparable_creators, shot_list }, sources };
}
