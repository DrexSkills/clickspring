# ClickSpring v0.01

**Stop guessing why people aren’t buying.**

For founders who get visitors but not customers. ClickSpring follows every visitor from first click to sign-up, shows exactly where they leave, and what the people who bought did differently.

Plain JavaScript, no build step. Supabase is the backend (auth, database, AI function).

```
index.html                         the whole app: landing, dashboard, funnel, advisor, campaign links, setup
tracker.js                         the script creators paste into their website
supabase/schema.sql                tables + security rules
supabase/functions/advisor/index.ts  AI growth advisor (calls Claude)
```

## Run it now (demo mode)
Open `index.html` in a browser. With no Supabase keys it runs in demo mode: data lives in that browser, and "See a live demo" loads sample data.

## Go live
1. **Supabase** – already done: project **ClickSpring** (`kuzdzlbyxllovbcudzsy`) is created, the tables and security rules are applied, and `config.js` holds its URL and public key.
2. **Auth** – Authentication → Sign In / Providers → Email: on (email + password). Keep "Confirm email" on.
   Authentication → URL Configuration: set Site URL to your live address (e.g. `https://clickspring.vercel.app`) and add `https://clickspring.vercel.app/**` to Redirect URLs. Sign-up confirmation and password-reset links come back to this address.
3. **Keys** – already in `config.js`. Keep it next to `index.html` when you deploy.
4. **Deploy the folder** – drag it into Netlify / Vercel, or push to GitHub Pages. `tracker.js` and `config.js` must sit next to `index.html`.
5. **AI advisor (optional)** – install the Supabase CLI, then:
   ```
   supabase login
   supabase link --project-ref YOUR_REF
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy advisor
   ```
   Without this, the rule-based advisor still works; only the "Analyze my funnel" button needs it.
6. **Test** – sign up, open Tracking setup, put the script on a test page, visit it with a tracking link, click a button, submit the form. Numbers show on the dashboard on refresh.

## Accounts
- `#signup` → name, email, password → confirmation email → `#start` (add website) → `#install`.
- `#login`, `#forgot` (reset email), `#reset` (set new password from the email link).
- Supabase's built-in email sender is rate-limited (a few emails per hour). Before inviting beta users, add your own SMTP (Resend, Postmark) under Authentication → SMTP Settings.

## How tracking works
- Page views on every load, plus route changes on single-page sites.
- Clicks on every button and link (add `data-cs-ignore` to skip, e.g. your nav).
- Sign-ups: any form with an email field counts automatically. For embedded forms or redirects, set the thank-you page path in Tracking Setup (adds `data-signup-path`), or call `ClickSpring.signup()`. If your form validates or can fail, add `data-cs-signup="manual"` to it and call `ClickSpring.signup()` only on success.
- Source from tracking links (`utm_source`, `cs_c`) or the referrer. First touch is remembered per browser.
- Test mode: open your site with `?cs_debug=1`. A green badge confirms each event, and Tracking Setup shows it live. Test visits are kept out of the stats.
- Post views are typed in by the user (v0.01 can't read Instagram/TikTok views).

## Known limits to fix after launch
- Anyone with a site ID can send fake events (normal for analytics scripts). Add rate limiting via an edge function if it becomes a problem.
- The dashboard downloads raw events (capped at 50k). Past a few thousand visitors a day, move the math into a SQL view.
- One website per account.
