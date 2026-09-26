// Brand Profile (BUILD_PLAN.md section 5): the nine fixed sections, the drafting prompt, the
// parser for the model's answer, and the stand-in profile used with fake services.
import { BRAND_PROFILE_SECTIONS, type BrandProfileKey } from "@shared/constants";
import type { BrandProfileSections } from "@shared/types";

export const PROFILE_KEYS = BRAND_PROFILE_SECTIONS.map((s) => s.key) as BrandProfileKey[];

/** Drafting in the Worker is one model call; past this much text the job drafts instead. */
export const WORKER_DRAFT_MAX_CHARS = 60_000;
export const SECTION_MAX_CHARS = 4_000;

export function emptySections(): BrandProfileSections {
  return Object.fromEntries(PROFILE_KEYS.map((k) => [k, ""])) as BrandProfileSections;
}

/** Keep only the nine keys, as trimmed strings of bounded length. */
export function cleanSections(x: unknown): BrandProfileSections {
  const out = emptySections();
  if (!x || typeof x !== "object") return out;
  const o = x as Record<string, unknown>;
  for (const k of PROFILE_KEYS) {
    const v = o[k];
    const s = Array.isArray(v) ? v.map((i) => `• ${String(i)}`).join("\n") : typeof v === "string" ? v : v == null ? "" : String(v);
    out[k] = s.trim().slice(0, SECTION_MAX_CHARS);
  }
  return out;
}

export function filledCount(s: BrandProfileSections): number {
  return PROFILE_KEYS.filter((k) => s[k].trim().length > 0).length;
}

/** Parse the model's JSON answer; tolerates a fenced code block around it. */
export function parseProfileAnswer(text: string): BrandProfileSections | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const s = cleanSections(JSON.parse(m[0]));
    return filledCount(s) >= 5 ? s : null;
  } catch {
    return null;
  }
}

export const PROFILE_SYSTEM = `You distill a creator's brand documents into one Brand Profile that every later AI step reads.
Answer with ONE JSON object and nothing else. Keys (all strings, plain words, short paragraphs or "• " bullet lines):
${BRAND_PROFILE_SECTIONS.map((s) => `  "${s.key}": ${s.label}`).join("\n")}
Rules: use only what the documents say or clearly imply; never invent numbers, names or partners.
If the documents say nothing about a section, write "Not in your docs yet." for it.
"themes" lists 3 to 5 themes. "do_dont" has "Do:" and "Don't:" lines. "off_limits" is what she never posts about.`;

export function profileUserPrompt(docs: { n: number; text: string }[]): string {
  return docs.map((d) => `--- Document ${d.n} ---\n${d.text}`).join("\n\n");
}

/**
 * Stand-in profile for FAKE_SERVICES=1: a realistic draft for Mercedes Asare, built from the
 * public facts on her site (justbeingmercedes.com: New York style and beauty creator, corporate
 * beauty strategy leader, Spelman alum, open to brand collaborations). Demo data only.
 */
export const FAKE_PROFILE: BrandProfileSections = {
  who: "Mercedes Asare is the creator behind Just Being Mercedes, a New York style and beauty brand. She is a Black woman who leads business strategy at a global beauty company by day and shares the honest, well-put-together version of her life the rest of the time: what she wears, what she puts on her skin, how she gets ready, and how a corporate beauty pro actually shops.",
  audience: "• Black women in their 20s to 40s who love beauty and style and want the real review, not the ad\n• Young professionals building a wardrobe, a routine and a career at the same time\n• New Yorkers and city women who get ready fast and want it to look effortless\n• People who trust a corporate beauty insider more than a trend",
  goals: "90 days: post consistently on TikTok, Instagram and YouTube Shorts; grow followers who save and come back for the routine; make the media kit brand-ready.\n1 year: be a go-to name for honest beauty and style from an insider; land 3–5 paid brand partnerships that fit (skincare, makeup, hair, fashion, city life).",
  voice: "Warm, direct and polished, with humour in it. Talks like a friend who happens to know the industry: \"Here's what actually works.\" Confident, never preachy; aspirational, never out of reach. Encouraging and specific.",
  themes: "• Get ready with me: the morning routine, the going-out look, the office face\n• Honest beauty reviews from someone who knows how the products are made\n• Style on a real budget: outfits, repeats, what earns its place in the closet\n• New York days: commutes, coffee, the city as the backdrop\n• Career and confidence: what a corporate beauty job is really like",
  do_dont: "Do: show the real result on her own skin and hair; name the product and the price; show the whole outfit, not a flat lay; keep the city in frame.\nDon't: claim a result she has not seen; read a brand's script; make it look expensive when it was not; talk down to anyone starting out.",
  off_limits: "Politics, gossip about colleagues or other creators, anything confidential from her employer, medical claims about skin or hair.",
  deal_fit: "Skincare and makeup (drugstore to prestige), hair care for Black women, fashion and accessories, fragrance, city and travel brands, tools and beauty tech. Not a fit: fast fashion that falls apart, crash diets, anything that clashes with an honest review.",
  ctas: "• \"Save this for your next Sephora run.\"\n• \"Follow for the full routine.\"\n• \"Tell me what you want reviewed next.\"\n• \"Send this to the friend who always asks what you're wearing.\"",
};
