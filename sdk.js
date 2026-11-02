/*! ClickSpring JavaScript SDK v1 — works in Node 18+, Deno, Bun and edge runtimes.
 *  import { ClickSpring } from "https://clickspring.live/sdk.js";
 *  const cs = new ClickSpring(process.env.CLICKSPRING_KEY);
 *  const stats = await cs.stats({ days: 30 });
 *  Keep your key on the server. Never put it in browser code.
 */
export class ClickSpringError extends Error {
  constructor(status, code, message) { super(message); this.name = "ClickSpringError"; this.status = status; this.code = code; }
}
export class ClickSpring {
  constructor(apiKey, { baseUrl = "https://kuzdzlbyxllovbcudzsy.supabase.co/functions/v1/api", fetch: f = globalThis.fetch } = {}) {
    if (!apiKey || !String(apiKey).startsWith("cs_live_")) throw new ClickSpringError(0, "missing_key", "Pass your ClickSpring API key (starts with cs_live_).");
    this.key = apiKey; this.base = baseUrl.replace(/\/$/, ""); this.fetch = f;
  }
  async request(method, path, { query, body } = {}) {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const res = await this.fetch(url, { method, headers: { Authorization: `Bearer ${this.key}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ClickSpringError(res.status, data?.error?.code || "http_error", data?.error?.message || `Request failed (${res.status})`);
    return data;
  }
  /** Which website this key belongs to. */
  me() { return this.request("GET", "/"); }
  /** Totals, funnel, sources, devices, top pages, buttons and exit pages. */
  stats({ days = 30 } = {}) { return this.request("GET", "/stats", { query: { days } }); }
  /** Latest events, newest first. type: "pageview" | "click" | "signup". since: ISO date. */
  events({ limit = 100, type, since } = {}) { return this.request("GET", "/events", { query: { limit, type, since } }); }
  /** Send one event or an array of up to 100. */
  track(event) { return this.request("POST", "/events", { body: event }); }
  /** Shortcut: record a sign-up from your server (e.g. after payment or email verification). */
  signup({ visitorId, label = "server", source, campaignId } = {}) {
    return this.track({ type: "signup", visitor_id: visitorId, label, source, campaign_id: campaignId });
  }
  /** Your tracking links with views, visits and sign-ups. */
  campaigns() { return this.request("GET", "/campaigns"); }
}
export default ClickSpring;
