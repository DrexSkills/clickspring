/* ClickSpring tracker v0.01.3
   <script src="https://YOUR-CLICKSPRING-DOMAIN/tracker.js" data-site="SITE_ID" data-endpoint="SUPABASE_URL" data-key="ANON_KEY" defer></script>
   Tracks automatically: page views (including single-page apps), clicks on buttons and links,
   and sign-ups from any form with an email field.
   Optional:  data-signup-path="/thank-you"  counts a sign-up when someone reaches that page.
              data-cs-signup on a form, or ClickSpring.signup() in your own code.
              data-cs-signup="manual" on a form: don’t count on submit; you call ClickSpring.signup() on success.
              data-cs-ignore on anything you don't want tracked.
              data-base-path="/repo-name" if your site lives in a sub-folder (e.g. GitHub Pages).
   Test mode: open your site with ?cs_debug=1 to see a badge confirming events are sent. */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var SITE = s.getAttribute("data-site"),
      EP = (s.getAttribute("data-endpoint") || "").replace(/\/$/, ""),
      KEY = s.getAttribute("data-key"),
      SIGNUP_PATH = (s.getAttribute("data-signup-path") || "").replace(/\/$/, ""),
      BASE_PATH = (s.getAttribute("data-base-path") || "").replace(/\/$/, "");
  // Clean page path: strip a hosting sub-folder (e.g. GitHub Pages) and "index.html"
  function pagePath() { var p = location.pathname; if (BASE_PATH && p.indexOf(BASE_PATH) === 0) p = p.slice(BASE_PATH.length); p = p.replace(/\/index\.html$/, "/"); return (p || "/").slice(0, 300); }
  if (!SITE || !EP || !KEY) { console.warn("[ClickSpring] Missing data-site, data-endpoint or data-key on the script tag."); return; }
  // Several websites (ClickSpring accounts) can track the same page: data-site="id1,id2", or a second script tag.
  var SITES = SITE.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
  if (window.ClickSpring && window.ClickSpring._add) { SITES.forEach(window.ClickSpring._add); return; }
  if (navigator.globalPrivacyControl === true) return; // respect the visitor's Global Privacy Control opt-out
  if (navigator.webdriver || /bot|crawl|spider|preview|lighthouse/i.test(navigator.userAgent)) return;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {} return null; }
  function newId() { try { return crypto.randomUUID(); } catch (e) { return "v" + Math.random().toString(36).slice(2) + Date.now().toString(36); } }

  var UA = navigator.userAgent, DEVICE = (navigator.userAgentData && navigator.userAgentData.mobile) || /Mobi|Android.+Mobile|iPhone|iPod/i.test(UA) ? "mobile"
    : /iPad|Tablet|Android/i.test(UA) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(UA)) ? "tablet" : "desktop";
  var vid = ls("cs_vid"); if (!vid) { vid = newId(); ls("cs_vid", vid); }
  var q = new URLSearchParams(location.search);
  if (q.get("cs_debug") === "1") ss("cs_debug", "1");
  var DEBUG = ss("cs_debug") === "1";

  // Where did this visitor come from? utm_source first, then the referrer. First touch is remembered.
  var src = (q.get("utm_source") || "").toLowerCase().slice(0, 40), camp = q.get("cs_c");
  if (!src) {
    var h = ""; try { h = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
    if (h && h !== location.hostname) {
      src = /instagram/.test(h) ? "instagram" : /tiktok/.test(h) ? "tiktok" : /youtube|youtu\.be/.test(h) ? "youtube"
          : /(^|\.)x\.com$|twitter|^t\.co$/.test(h) ? "x" : /facebook|fb\.com/.test(h) ? "facebook"
          : /google\./.test(h) ? "google" : "other";
    }
  }
  camp = camp && UUID.test(camp) ? camp : null;
  if (src || camp) { ls("cs_src", src || ""); ls("cs_camp", camp || ""); }
  src = src || ls("cs_src") || "direct";
  camp = camp || ls("cs_camp") || null;

  // Debug badge
  var badge;
  function show(msg, bad) {
    if (!DEBUG) return;
    if (!badge) {
      badge = document.createElement("div");
      badge.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:2147483647;font:600 13px/1.3 system-ui,sans-serif;padding:10px 14px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.25);color:#fff;transition:background .2s";
      (document.body || document.documentElement).appendChild(badge);
    }
    badge.style.background = bad ? "#d4342c" : "#1fbf4f";
    badge.textContent = (bad ? "ClickSpring: " : "ClickSpring \u2713 ") + msg;
  }

  function send(type, label, only, extra) {
    (only ? [only] : SITES).forEach(function (site) { sendOne(site, type, label, extra); });
  }
  function sendOne(site, type, label, extra) {
    extra = extra || {};
    var body = JSON.stringify({ site_id: site, type: type, visitor_id: vid, source: DEBUG ? "test" : src, campaign_id: camp,
      path: extra.path || pagePath(), device: DEVICE, label: label ? String(label).replace(/\s+/g, " ").trim().slice(0, 80) : null,
      target: extra.target || null, zone: extra.zone || null, fold: extra.fold == null ? null : extra.fold,
      dwell_s: extra.dwell_s == null ? null : extra.dwell_s, scroll_pct: extra.scroll_pct == null ? null : extra.scroll_pct });
    var ok = function () { show(type + " sent"); };
    var fail = function (st) { show("couldn\u2019t send " + type + (st ? " (" + st + ")" : "") + ". Check data-site and data-key.", true); if (window.console) console.warn("[ClickSpring] event not saved", st || ""); };
    // 1) Simple request: text/plain body + key in URL, so the browser sends it without a CORS preflight
    //    and it survives page navigation (keepalive).
    var fallback = function () {
      // 2) Backup: standard REST insert with headers (needs a preflight, so no keepalive).
      try {
        fetch(EP + "/rest/v1/events", { method: "POST", body: body,
          headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "return=minimal" } })
          .then(function (r) { r.ok ? ok() : fail(r.status); }).catch(function () { fail(); });
      } catch (e) { fail(); }
    };
    try {
      fetch(EP + "/rest/v1/rpc/track?apikey=" + encodeURIComponent(KEY), { method: "POST", keepalive: true, body: body, headers: { "Content-Type": "text/plain" } })
        .then(function (r) { r.ok ? ok() : (r.status === 404 || r.status === 415 || r.status === 401 ? fallback() : fail(r.status)); })
        .catch(fallback);
    } catch (e) { fallback(); }
  }

  // ---- Time on page + how far people scrolled (sent once when they leave) ----
  var pvStart = Date.now(), maxScroll = 0, leftSent = false;
  function scrollPct() {
    var d = document.documentElement, h = Math.max(d.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if (!h) return 0;
    return Math.min(100, Math.round(((window.pageYOffset || d.scrollTop || 0) + window.innerHeight) / h * 100));
  }
  window.addEventListener("scroll", function () { var p = scrollPct(); if (p > maxScroll) maxScroll = p; }, { passive: true });
  function sendLeave(path) {
    if (leftSent || lastPath === null) return;
    leftSent = true;
    var p = scrollPct(); if (p > maxScroll) maxScroll = p;
    send("leave", null, null, { path: path, dwell_s: Math.min(3600, Math.round((Date.now() - pvStart) / 1000)), scroll_pct: maxScroll });
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") sendLeave(); });
  window.addEventListener("pagehide", function () { sendLeave(); });

  var lastPath = null, signedUp = false;
  function pageview() {
    if (pagePath() === lastPath) return;
    if (lastPath !== null) sendLeave(lastPath);   // single-page apps: the previous page is "left" now
    lastPath = pagePath();
    pvStart = Date.now(); maxScroll = scrollPct(); leftSent = false;
    send("pageview");
    if (SIGNUP_PATH && pagePath().replace(/\/$/, "") === SIGNUP_PATH) signup("thank-you page");
  }
  function signup(label) { if (signedUp) return; signedUp = true; send("signup", label || "signup"); setTimeout(function () { signedUp = false; }, 3000); }

  // Single-page apps: count route changes as page views
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    history[m] = function () { var r = orig.apply(this, arguments); setTimeout(pageview, 0); return r; };
  });
  window.addEventListener("popstate", pageview);

  function describe(el) {
    var t = el.tagName.toLowerCase(), id = el.id ? "#" + el.id : "", extra = "";
    if (t === "a") { try { var u = new URL(el.href, location.href); extra = "\u2192" + (u.origin === location.origin ? u.pathname.replace(/\/index\.html$/, "/") + (u.hash || "") : u.hostname); } catch (e) {} }
    else if ((t === "button" || t === "input") && el.form && el.type === "submit") extra = "(submit)";
    return (t + id + extra).slice(0, 120);
  }
  function zoneOf(el) {
    for (var e = el.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      var tag = e.tagName, name = "";
      if (e.id) name = e.id;
      else if (/^(HEADER|NAV|FOOTER|FORM|ASIDE|MAIN)$/.test(tag)) name = tag.toLowerCase();
      else if (tag === "SECTION" || (e.getAttribute && e.getAttribute("role") === "region")) { var h = e.querySelector("h1,h2,h3"); name = h ? h.textContent : "section"; }
      if (name) return String(name).replace(/\s+/g, " ").trim().slice(0, 60);
    }
    return "page";
  }
  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest && ev.target.closest("a,button,[data-cs-click],input[type=submit],input[type=button],[role=button]");
    if (!el || el.closest("[data-cs-ignore]")) return;
    var label = el.getAttribute("data-cs-click") || el.innerText || el.value || el.getAttribute("aria-label") || el.tagName.toLowerCase();
    var fold = null;
    try { fold = Math.round(((el.getBoundingClientRect().top + (window.pageYOffset || 0)) / Math.max(320, window.innerHeight)) * 10) / 10; if (!(fold >= 0)) fold = null; } catch (e) {}
    send("click", label, null, { target: describe(el), zone: zoneOf(el), fold: fold });
  }, true);

  document.addEventListener("submit", function (ev) {
    var f = ev.target;
    if (!f || !f.querySelector || f.closest("[data-cs-ignore]")) return;
    if (f.getAttribute("data-cs-signup") === "manual") return; // site calls ClickSpring.signup() itself after success
    if (f.hasAttribute("data-cs-signup") || f.querySelector("input[type=email],input[name*=email i],input[autocomplete=email]"))
      signup(f.getAttribute("data-cs-signup") || "form");
  }, true);

  window.ClickSpring = { signup: signup, track: function (t, l) { send(t, l); },
    _add: function (id) { if (!id || SITES.indexOf(id) >= 0) return; SITES.push(id); if (lastPath !== null) send("pageview", null, id); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pageview); else pageview();
})();
