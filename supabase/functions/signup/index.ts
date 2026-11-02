// ClickSpring sign-up: creates a ready-to-use account (no confirmation email)
// and allows only one account per device.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, SRK, { auth: { persistSession: false, autoRefreshToken: false } });
const SALT = SRK.slice(-32);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const fail = (status: number, code: string, message: string) => reply({ error: { code, message } }, status);
async function hash(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT + t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail(405, "method", "Use POST.");
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return fail(400, "bad_json", "Something went wrong. Try again."); }
  const name = String(b.name || "").trim().slice(0, 80);
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const site_url = String(b.site_url || "").trim().slice(0, 300);
  const site_name = String(b.site_name || "").trim().slice(0, 100);
  const device = String(b.device_id || "");
  const fp = String(b.fp || "");
  if (!name) return fail(400, "name", "Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail(400, "email", "Enter a valid email address.");
  if (password.length < 8 || password.length > 72) return fail(400, "password", "Use a password with at least 8 characters.");
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(site_url)) return fail(400, "site", "Enter your website address, like yoursite.com.");
  if (device.length < 8 || device.length > 100) return fail(400, "device", "Please allow this site to store data in your browser, then try again.");

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const [dh, fh, ih] = await Promise.all([hash("d:" + device), fp ? hash("f:" + fp) : Promise.resolve(null), hash("i:" + ip)]);
  const taken = "This device already has a ClickSpring account. Log in to it instead. You can restart your website any time in Settings.";

  const byDevice = await admin.from("device_signups").select("id").eq("device_hash", dh).limit(1);
  if (byDevice.error) return fail(500, "server", "Something went wrong. Try again.");
  if (byDevice.data.length) return fail(409, "device_taken", taken);
  if (fh) {
    const byFp = await admin.from("device_signups").select("id").eq("fp_hash", fh).eq("ip_hash", ih).limit(1);
    if (byFp.data && byFp.data.length) return fail(409, "device_taken", taken);
  }
  const since = new Date(Date.now() - 864e5).toISOString();
  const byIp = await admin.from("device_signups").select("id", { count: "exact", head: true }).eq("ip_hash", ih).gte("created_at", since);
  if ((byIp.count || 0) >= 5) return fail(429, "too_many", "Too many new accounts from this network today. Try again tomorrow.");

  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: name, site_url, site_name },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return fail(409, "email_taken", "That email already has an account. Log in instead.");
    if (/password/i.test(error.message)) return fail(400, "password", "Choose a stronger password with at least 8 characters.");
    return fail(400, "signup", error.message);
  }
  await admin.from("device_signups").insert({ user_id: data.user!.id, device_hash: dh, fp_hash: fh, ip_hash: ih });
  return reply({ ok: true });
});
