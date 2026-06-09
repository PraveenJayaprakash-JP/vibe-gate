# Vibe Gate — Launch Guide

## Prerequisites
- [ ] GitHub Student Developer Pack activated (https://education.github.com/pack)
- [ ] Node.js 20+ installed
- [ ] Git installed

---

## Step 1 — npm Publish (10 min)

```bash
cd vibe-gate

# 1a. Login to npm (creates ~/.npmrc with your token)
npm login
# → Enter username, password, email, OTP

# 1b. Publish
npm publish

# 1c. Verify
npx vibe-gate --version
# → Should print "0.1.0"
npx vibe-gate https://example.com
# → Should scan and print report
```

**If `vibe-gate` name is taken on npm:** Change `package.json` → `"name": "vibe-gate-cli"` or `"vibegate"`, then republish.

---

## Step 2 — Claim Free Domain (15 min)

From your Student Pack dashboard:

1. Go to https://education.github.com/pack
2. Find **Namecheap** or **.TECH** domain offer
3. Click "Get your free domain"
4. Search for: `vibegate.dev` or `vibegate.tech`
5. Complete registration (use your Namecheap/.TECH account)
6. **Do NOT change DNS yet** — do it after Vercel deploy

Fallback (no domain): Use `vibe-gate.vercel.app` for free.

---

## Step 3 — Deploy to Vercel (15 min)

Option A — Deploy via CLI (faster):

```bash
# Install Vercel CLI
npm install -g vercel

# Login with GitHub (your Student Pack account)
vercel login

# Deploy from vibe-gate directory
cd vibe-gate
vercel --prod

# Vercel will ask:
# ? Set up and deploy? Y
# ? Which scope? [pick your GitHub account]
# ? Link to existing project? N
# ? Project name: vibe-gate
# ? Output directory: . (or web/)
# → Wait for deploy URL
```

Option B — Deploy via Vercel Dashboard (easier):

1. Go to https://vercel.com/new
2. Import GitHub repo: `PraveenJayaprakash-JP/vibe-gate`
3. Framework: **Other**
4. Root directory: **vibe-gate** (if prompted)
5. Deploy

**After deploy:** You'll get `https://vibe-gate.vercel.app` — verify:

```bash
curl https://vibe-gate.vercel.app/api/plans
# → Should return JSON with Free/Pro/Growth/Enterprise plans
```

---

## Step 4 — Point Domain to Vercel (10 min)

1. In Vercel Dashboard → vibe-gate project → Settings → Domains
2. Add: `vibegate.dev` (or whatever you registered)
3. Vercel will show DNS records to add
4. Go to your domain registrar (Namecheap/.TECH) → DNS settings
5. Add the CNAME record Vercel showed you:
   - Type: CNAME
   - Name: @ (or your subdomain)
   - Target: cname.vercel.com
6. Wait 5-30 min for DNS to propagate
7. Verify: `https://vibegate.dev/api/plans` works

---

## Step 5 — Set Up Stripe (20 min)

```bash
# 5a. Create Stripe account
# Go to https://dashboard.stripe.com/register
# Use your GitHub Student email
```

5b. Get API keys:
- Stripe Dashboard → Developers → API Keys
- Copy `Publishable key` (starts with pk_)
- Copy `Secret key` (starts with sk_) — save securely

5c. Create products:
- Stripe Dashboard → Products → Add Product
- Create 3 products:
  1. **Pro Monthly** — $29/month → Copy Price ID (starts with price_)
  2. **Growth Monthly** — $79/month → Copy Price ID
  3. **Enterprise** — contact sales (no Stripe price needed)

5d. Set up webhook:
- Stripe Dashboard → Developers → Webhooks → Add endpoint
- Endpoint URL: `https://vibegate.vercel.app/api/webhook`
- Events to listen: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Copy the `Signing secret` (starts with whsec_)

5e. Add to Vercel:
```bash
vercel env add STRIPE_SECRET_KEY   # paste sk_...
vercel env add STRIPE_WEBHOOK_SECRET  # paste whsec_...
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  # paste pk_...
vercel redeploy
```

---

## Step 6 — Test Everything (30 min)

```bash
# 6a. Test CLI
npx vibe-gate https://example.com --output html

# 6b. Test submit (upload to cloud)
npx vibe-gate submit https://example.com

# 6c. Verify landing page
curl https://vibegate.dev
# → Should show your landing page with pricing

# 6d. Verify API
curl https://vibegate.dev/api/plans
# → Returns JSON with all 4 tiers
```

---

## Step 7 — Launch (1 hr)

### 7a. Push latest to GitHub
```bash
cd vibe-gate
git add -A
git commit -m "feat: landing page, API backend, Stripe billing, submit command"
git push
```

### 7b. Post on Hacker News
Title: `Show HN: Vibe Gate – Free, open-source quality gate for AI-generated web apps`
URL: `https://vibegate.dev`
- Be active in comments for first 3 hours
- Mention: free, open-source, npx one-liner
- Link to GitHub repo

### 7c. Post on Reddit
- r/SaaS — "I built a free tool that scans AI-generated apps for broken flows"
- r/webdev — "Your AI-coded app probably has issues. Here's a free checker"
- r/startups — "Free quality gate for vibe-coded apps"
- Include the `npx vibe-gate` one-liner

### 7d. Post on X
```
Just shipped vibe-gate — a free CLI that scans vibe-coded apps for broken flows and security holes.

One command:
  npx vibe-gate https://your-app.com

Open source, MIT.
https://github.com/PraveenJayaprakash-JP/vibe-gate
```

### 7e. Product Hunt (optional, takes more prep)
- Create a beautiful landing page first
- Get a demo video
- Prepare a launch post

---

## Ongoing — Converting Free Users to Paid

The funnel: `npx vibe-gate` → sees grade + issues → sees "Upgrade to Pro for continuous monitoring" → clicks → Stripe checkout.

**Don't add paywalls to the CLI.** The CLI is your distribution. The paid product is:
- Hosted dashboard (scan history over time)
- Scheduled scans (daily/weekly)
- Slack/email alerts when grade drops
- Team/SSO features

---

## Cost Summary

| Item | Cost | Source |
|------|------|--------|
| Domain (`.dev`/`.tech`) | **$0** (1 yr) | GitHub Student Pack |
| Vercel Pro | **$0** (free) | GitHub Student Pack |
| npm publish | **$0** | Free for public packages |
| GitHub | **$0** | Free for public repos |
| Stripe | **$0** to start | No monthly fee, only transaction % |
| **Total** | **$0** | |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm publish` fails (name taken) | Rename to `vibe-gate-cli` in package.json |
| Vercel deploy shows 404 | Check `vercel.json` rewrites are correct |
| Stripe webhook failing | Log into Stripe dashboard → check webhook attempts |
| `npx vibe-gate` runs old version | Clear npm cache: `npm cache clean -f` |
| Domain not resolving | Wait for DNS propagation (up to 48h, usually 5-30 min) |
