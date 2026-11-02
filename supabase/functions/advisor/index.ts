// ClickSpring "Why They Leave" plan writer – Supabase Edge Function.
// Needs the secret ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets).
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SYSTEM = `You help founders understand why website visitors aren't becoming customers.
You get JSON from ClickSpring: visitors, clicks, sign-ups, traffic sources, devices, exit pages, what customers did differently,
campaign posts (views are typed in by the founder), an automatic diagnosis with confidence levels, and changes the founder is already testing.
Write a plan for this week:
- Start with one sentence naming the single biggest reason people aren't signing up, citing their numbers.
- Then at most 3 actions, most impactful first. Each: what to change, exactly where, and the number it should move.
- If a change is already being tested, say whether it's working and what to do next.
- If confidence is "Early signal" or there are fewer than 30 visitors, say plainly the data is thin and make getting more visitors one of the actions.
Plain words, no jargon, no markdown headers, no hype. Under 220 words.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return Response.json({ error: "not configured: set ANTHROPIC_API_KEY" }, { status: 503, headers: cors });
  try {
    const { summary } = await req.json();
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, system: SYSTEM,
        messages: [{ role: "user", content: JSON.stringify(summary).slice(0, 24000) }] }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message ?? "AI request failed");
    const text = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
    return Response.json({ text }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 500, headers: cors });
  }
});
