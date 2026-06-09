# Building Vibe Gate: A Quality Gate for AI-Generated Code

**June 10, 2026** · 5 min read · #Launch #OpenSource #DevTools

---

I ship a lot of code. Like most developers in 2026, a growing percentage of that code is generated or assisted by AI — Claude, Cursor, Copilot.

The speed is incredible. But there's a catch.

**1 in 3 AI-generated web apps has a silently broken flow.** Missing auth guards. Exposed API keys. Broken CSP headers. Pages that don't load. These aren't edge cases — they're the norm when you ship code you didn't write line-by-line.

Existing tools (SonarQube, CodeRabbit, Snyk) are powerful but assume you're a team with a CI pipeline, a dedicated security engineer, and hours to configure rules. That's not the world most of us live in.

So I built something different.

## Introducing Vibe Gate

Vibe Gate is a free, open-source CLI that scans any deployed web app for issues in one command:

```
npx vibe-gate https://your-app.com
```

No config. No signup. No CI pipeline required. Just point it at a URL, get a graded report with specific fixes.

## What it checks

The scanner runs Playwright in headless mode against your live URL and checks 5 categories:

| Category | Weight | What's checked |
|---|---|---|
| Page Health | 15% | Load success, console errors, render time |
| Security Headers | 25% | CSP, HSTS, X-Frame-Options, and 3 more |
| Secrets Exposure | 20% | API keys, tokens, passwords in source |
| Auth Coverage | 20% | Unprotected routes, missing login |
| Mixed Content | 10% | HTTP resources on HTTPS pages |

Each category gets a score, weighted by severity, producing an A–F grade with specific remediation steps.

## The tech stack

- **CLI**: TypeScript + Playwright, published via npm
- **Dashboard**: Vanilla HTML/CSS/JS with Supabase Auth + PostgreSQL
- **Hosting**: Vercel Edge Functions + serverless APIs
- **Payments**: Stripe (Pro $9/mo, Growth $29/mo)
- **CI**: GitHub Actions for PR gating

The entire frontend is a single self-contained HTML file with embedded CSS and JS. No React, no build step, no framework overhead.

## Why open-core?

The CLI is MIT — free forever. The cloud dashboard (scan history, analytics, team features) requires a subscription. I believe quality gating should be universally accessible; the paid tier is for teams that need persistence and collaboration.

## What I learned

**1. AI-generated code needs a different kind of testing.** Unit tests catch logic errors. They don't catch "the app doesn't load" or "your API key is in the JavaScript bundle". Vibe Gate treats the deployed app as a black box and tests what users actually experience.

**2. Developer tools should be one command away.** The biggest complaint about existing tools is setup complexity. Every additional step between "I want to check this" and "here are the results" loses users. `npx vibe-gate` was a deliberate design choice.

**3. Design matters for developer tools.** The landing page design (reference-based, pixel-perfect with teal accent) took multiple iterations. Professional design signals quality and builds trust — especially important for a security tool.

**4. Stripe checkout for CLI products is surprisingly straightforward.** The `/api/checkout` endpoint creates a Stripe session, the webhook handles subscription events. About 50 lines of code total.

## Roadmap

- **Scheduled scans** — daily/weekly automatic re-scans
- **Slack/Discord alerts** — webhook notifications on grade changes
- **Team seats** — shared scan history across a team
- **Watch mode** — `vibe-gate watch` for continuous monitoring
- **VS Code extension** — scan from within the editor

## Try it

```bash
npx vibe-gate https://your-app.com
```

Or check the dashboard at [vibe-gate.dev](https://vibe-gate.dev)

GitHub: [github.com/PraveenJayaprakash-JP/vibe-gate](https://github.com/PraveenJayaprakash-JP/vibe-gate)

---

*Built by [Praveen Jayaprakash](https://github.com/PraveenJayaprakash-JP). Feedback welcome — open an issue or email praveen@vibe-gate.dev.*
