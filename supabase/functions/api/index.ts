// ClickSpring public API – https://<project>.supabase.co/functions/v1/api
// Auth: "Authorization: Bearer cs_live_..." (create keys in ClickSpring → Settings → API keys)
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
const TYPES = ["pageview", "click", "signup"], DEVICES = ["mobile", "tablet", "desktop"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
type Ev = { type: string; visitor_id: string; source: string | null; campaign_id: string | null; path: string | null; label: string | null; device: string | null; created_at: string };

async function loadEvents(siteId: string, sinceIso: string, max = 100000) {
  const out: Ev[] = [];
  for (let from = 0; out.length < max; from += 1000) {
    const { data, error } = await sb.from("events").select("type,visitor_id,source,campaign_id,path,label,device,created_at")
      .eq("site_id", siteId).gte("created_at", sinceIso).order("created_at").range(from, from + 999);
    if (error) throw error;
    out.push(...(data as Ev[]));
    if (!data || data.length < 1000) break;
  }
  return out.filter((e) => e.source !== "test");
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 10000) / 100 : 0);
function summarize(list: Ev[]) {
  const v = new Set<string>(), c = new Set<string>(), s = new Set<string>(); let pageviews = 0, clicks = 0;
  for (const e of list) { v.add(e.visitor_id); if (e.type === "pageview") pageviews++; if (e.type === "click") { clicks++; c.add(e.visitor_id); } if (e.type === "signup") s.add(e.visitor_id); }
  return { visitors: v.size, pageviews, clicks, clicked: c.size, signups: s.size, conversion_rate: pct(s.size, v.size) };
}
function groupFirst(list: Ev[], key: (e: Ev) => string | null) {
  const first = new Map<string, string | null>(), g = new Map<string, Ev[]>();
  for (const e of list) if (!first.has(e.visitor_id)) first.set(e.visitor_id, key(e));
  for (const e of list) { const k = first.get(e.visitor_id); if (k == null) continue; if (!g.has(k)) g.set(k, []); g.get(k)!.push(e); }
  return g;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/api/, "").replace(/\/$/, "") || "/";

  // --- auth
  const raw = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || req.headers.get("x-api-key") || "";
  if (!raw.startsWith("cs_live_")) return fail(401, "missing_key", "Send your API key as: Authorization: Bearer cs_live_…");
  const { data: key } = await sb.from("api_keys").select("id,site_id,revoked_at").eq("key_hash", await sha256(raw)).maybeSingle();
  if (!key || key.revoked_at) return fail(401, "invalid_key", "This API key doesn’t exist or was revoked.");
  const { data: site } = await sb.from("sites").select("id,name,url,created_at").eq("id", key.site_id).single();
  sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id).then(() => {});

  try {
    if (path === "/" && req.method === "GET") {
      return json({ ok: true, site, endpoints: ["GET /stats", "GET /events", "POST /events", "GET /campaigns"] });
    }

    if (path === "/stats" && req.method === "GET") {
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") || "30") || 30));
      const since = new Date(Date.now() - days * 864e5).toISOString();
      const ev = await loadEvents(site!.id, since);
      const totals = summarize(ev);
      const by = (k: (e: Ev) => string | null) => [...groupFirst(ev, k)].map(([name, l]) => ({ name, ...summarize(l) })).sort((a, b) => b.visitors - a.visitors);
      const perV = new Map<string, Ev[]>(); for (const e of ev) { if (!perV.has(e.visitor_id)) perV.set(e.visitor_id, []); perV.get(e.visitor_id)!.push(e); }
      const exits = new Map<string, number>(); let leavers = 0;
      for (const l of perV.values()) { if (l.some((e) => e.type === "signup")) continue; leavers++; const pv = l.filter((e) => e.type === "pageview"); const p = (pv.at(-1) || l.at(-1))!.path || "/"; exits.set(p, (exits.get(p) || 0) + 1); }
      const pages = new Map<string, number>(); for (const e of ev) if (e.type === "pageview") pages.set(e.path || "/", (pages.get(e.path || "/") || 0) + 1);
      const buttons = new Map<string, number>(); for (const e of ev) if (e.type === "click" && e.label) buttons.set(e.label, (buttons.get(e.label) || 0) + 1);
      const top = (m: Map<string, number>, n = 10) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
      return json({
        site: { id: site!.id, name: site!.name, url: site!.url }, period: { days, since },
        totals, funnel: [{ step: "visited", count: totals.visitors }, { step: "clicked", count: totals.clicked }, { step: "signed_up", count: totals.signups }],
        sources: by((e) => e.source || "direct"), devices: by((e) => e.device),
        top_pages: top(pages).map(([path, views]) => ({ path, views })),
        top_buttons: top(buttons).map(([label, clicks]) => ({ label, clicks })),
        exit_pages: top(exits).map(([path, n]) => ({ path, visitors_left: n, share: pct(n, leavers) })),
      });
    }

    if (path === "/events" && req.method === "GET") {
      const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("limit") || "100") || 100));
      let q = sb.from("events").select("type,visitor_id,source,campaign_id,path,label,device,created_at").eq("site_id", site!.id).or("source.is.null,source.neq.test").order("created_at", { ascending: false }).limit(limit);
      const t = url.searchParams.get("type"); if (t) { if (!TYPES.includes(t)) return fail(400, "bad_type", `type must be one of ${TYPES.join(", ")}`); q = q.eq("type", t); }
      const since = url.searchParams.get("since"); if (since) { if (isNaN(Date.parse(since))) return fail(400, "bad_since", "since must be an ISO date, like 2026-11-01"); q = q.gte("created_at", new Date(since).toISOString()); }
      const { data, error } = await q; if (error) throw error;
      return json({ data, count: data.length });
    }

    if (path === "/events" && req.method === "POST") {
      let body: unknown; try { body = await req.json(); } catch { return fail(400, "bad_json", "Body must be JSON."); }
      const list = Array.isArray(body) ? body : [body];
      if (!list.length || list.length > 100) return fail(400, "bad_batch", "Send 1 to 100 events at a time.");
      const rows = [];
      for (const [i, e] of list.entries()) {
        if (!e || typeof e !== "object") return fail(400, "bad_event", `Event ${i} must be an object.`);
        const o = e as Record<string, unknown>;
        if (!TYPES.includes(String(o.type))) return fail(400, "bad_type", `Event ${i}: type must be one of ${TYPES.join(", ")}.`);
        rows.push({
          site_id: site!.id, type: String(o.type),
          visitor_id: String(o.visitor_id || "server-" + crypto.randomUUID()).slice(0, 64),
          source: o.source ? String(o.source).toLowerCase().slice(0, 40) : "api",
          campaign_id: o.campaign_id && UUID.test(String(o.campaign_id)) ? String(o.campaign_id) : null,
          path: o.path ? String(o.path).slice(0, 300) : null, label: o.label ? String(o.label).slice(0, 80) : null,
          device: DEVICES.includes(String(o.device)) ? String(o.device) : null,
        });
      }
      const { error } = await sb.from("events").insert(rows); if (error) throw error;
      return json({ ok: true, inserted: rows.length }, 201);
    }

    if (path === "/campaigns" && req.method === "GET") {
      const { data: camps, error } = await sb.from("campaigns").select("id,name,platform,slug,views,created_at").eq("site_id", site!.id).order("created_at", { ascending: false });
      if (error) throw error;
      const ev = await loadEvents(site!.id, new Date(Date.now() - 365 * 864e5).toISOString());
      const g = groupFirst(ev, (e) => e.campaign_id);
      return json({ data: camps.map((c) => { const s = summarize(g.get(c.id) || []); return { ...c, ...s, view_to_visit_rate: pct(s.visitors, c.views) }; }) });
    }

    return fail(404, "not_found", `No endpoint ${req.method} ${path}. Try GET /stats, GET /events, POST /events or GET /campaigns.`);
  } catch (e) {
    return fail(500, "server_error", String((e as Error).message ?? e));
  }
});
