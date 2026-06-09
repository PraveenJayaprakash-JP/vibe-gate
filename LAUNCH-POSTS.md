# Launch Posts — Vibe Gate

## Show HN

**Title:** Show HN: Vibe Gate – One-command quality gate for AI-generated web apps

Ship AI apps without blind spots. One command (`npx vibe-gate`) scans any web app for broken flows, security holes, and auth gaps. No config, no signup, just results.

Built this because I kept shipping AI-generated code with subtle bugs — missing auth guards, exposed secrets, broken CSP headers. Existing tools (SonarQube, CodeRabbit) need CI/CD setup. Vibe Gate works on any deployed URL instantly.

**What it checks:**
- Page health (load time, HTTP status, render)
- Console errors (JS, 404, API failures)
- Security headers (CSP, HSTS, XFO, etc.)
- Secrets exposure (API keys, tokens)
- Auth coverage (unprotected routes)

CLI is free and open-source (MIT). Cloud dashboard (scan history, Slack alerts) coming soon.

**Links:**
- GitHub: https://github.com/PraveenJayaprakash-JP/vibe-gate
- npm: `npx vibe-gate https://your-app.com`
- Site: https://vibe-gate.dev

---

## Reddit r/SaaS

**Title:** Built a CLI that scans AI-generated web apps for security holes in one command

Been using Cursor/Claude to ship web apps fast, but kept catching issues post-deploy — broken pages, missing CSP headers, leaked API keys. Existing tools are heavy and need CI setup.

So I built Vibe Gate: `npx vibe-gate https://your-app.com`

It runs Playwright in headless mode and checks 5 categories — page health, console errors, security headers, secrets, auth coverage. Gives you an A-F grade with specific fix recommendations.

Free, open-source, MIT. Would love feedback.

https://vibe-gate.dev

---

## Reddit r/webdev

**Title:** I built a free CLI that catches security issues in AI-generated web apps

**Body:** Same as r/SaaS but tailored for web developers.

---

## Reddit r/ClaudeAI

**Title:** PSA: Check your Claude-generated apps for security holes with this free CLI

**Body:** If you're using Claude/Cursor to ship web apps, you might be missing:
- Missing CSP headers (XSS risk)
- Exposed API keys
- Unprotected routes
- Broken page loads

I built Vibe Gate to catch these in one command: `npx vibe-gate https://your-app.com`

Free and open-source. https://github.com/PraveenJayaprakash-JP/vibe-gate

---

## X (Twitter)

Ship AI code without blind spots 🛡️

`npx vibe-gate https://your-app.com`

One command scans for:
• Broken pages
• Security holes
• Auth gaps
• Leaked secrets

Free. Open-source. No signup.

https://github.com/PraveenJayaprakash-JP/vibe-gate

---

## How to post

1. **Show HN** — Go to https://news.ycombinator.com/submit, paste title + body
2. **Reddit** — Go to each subreddit, submit link post to https://vibe-gate.dev
3. **X** — Paste the short version with screenshot/GIF
