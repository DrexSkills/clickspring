// ClickSpring AI Growth Advisor – Supabase Edge Function.
// Deploy:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   then   supabase functions deploy advisor
const MODEL = "claude-sonnet-5-5"; // change to any current Claude model

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are ClickSpring's growth advisor for creators who get views on Instagram/TikTok/YouTube but too few website sign-ups.
You get a JSON summary of their funnel: post views (typed in by the creator), website visits, button clicks, sign-ups, traffic sources and campaigns.
Find the 3 biggest leaks, ordered by how many sign-ups fixing them would win back. For each: one plain sentence on what the numbers show,
one concrete fix they can do this week, and a rough estimate of the gain using their own numbers.
Be direct and specific. No jargon, no generic advice, no markdown headers. Under 250 words.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { summary } = await req.json();
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system: SYSTEM,
        messages: [{ role: "user", content: JSON.stringify(summary).slice(0, 20000) }],
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message ?? "AI request failed");
    const text = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
    return Response.json({ text }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 500, headers: cors });
  }
});
