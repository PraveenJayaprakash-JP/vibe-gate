# <a href="https://vibe-gate.dev">🛡️ Vibe Gate</a>

<p align="center">
  <a href="https://vibe-gate.dev"><img alt="Vibe Gate" src="https://raw.githubusercontent.com/PraveenJayaprakash-JP/vibe-gate/master/public/og-image.png"></a>
</p>

<p align="center">
  <a href="https://github.com/PraveenJayaprakash-JP/vibe-gate/actions"><img src="https://img.shields.io/github/actions/workflow/status/PraveenJayaprakash-JP/vibe-gate/ci.yml?branch=master&style=flat-square&label=CI" alt="CI"></a>
  <a href="https://www.npmjs.com/package/vibe-gate"><img src="https://img.shields.io/npm/v/vibe-gate?style=flat-square" alt="npm version"></a>
  <a href="https://vibe-gate.dev"><img src="https://img.shields.io/badge/dashboard-vibe--gate.dev-00d4aa?style=flat-square" alt="Dashboard"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square&logo=node.js&logoColor=white" alt="Node version">
</p>

**Quality gate for AI-generated web apps.**

Scan any web app for broken flows, security holes, and auth gaps — before your users find them. One command, plain-English report, zero cost.

```bash
npx vibe-gate https://your-app.com
```

🌐 **Dashboard & analytics**: [vibe-gate.dev](https://vibe-gate.dev) — sign in with GitHub, view scan history, track trends.

---

### Screenshots

<p align="center">
  <img src="https://raw.githubusercontent.com/PraveenJayaprakash-JP/vibe-gate/master/public/screenshot-hero.png" alt="Vibe Gate CLI and landing page" width="49%">
  <img src="https://raw.githubusercontent.com/PraveenJayaprakash-JP/vibe-gate/master/public/screenshot-dashboard.png" alt="Vibe Gate Dashboard with scan history and analytics" width="49%">
</p>

---

## Quick Start

```bash
npx vibe-gate https://your-app.com
```

Scans the live URL and outputs a graded report to your terminal. No install, no config.

## Why

AI coding tools (Cursor, Claude Code, Bolt, Replit) let you ship fast. But **1 in 3 user flows silently fails** in AI-generated apps. Existing tools assume you're a developer with a CI pipeline. Vibe Gate is built for everyone who ships code they can't fully audit.

## Install

```bash
# No install needed — run directly
npx vibe-gate https://your-app.com

# Or install globally
npm install -g vibe-gate
vibe-gate https://your-app.com
```

## Usage

```bash
# Scan a deployed web app
vibe-gate https://myapp.vercel.app

# Scan local project files
vibe-gate scan ./my-project

# Verbose output
vibe-gate https://myapp.vercel.app --verbose

# Save HTML report
vibe-gate https://myapp.vercel.app --output html
```

## Local Scan

Scan project source files without a running server:

```bash
cd your-project && npx vibe-gate scan .
```

Checks your source tree for exposed secrets, missing auth guards, and mixed content patterns before you deploy.

## CI Integration

Use the GitHub Action to gate deployments on scan results:

```yaml
name: Vibe Gate

on: [pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npx vibe-gate ${{ secrets.STAGING_URL }} --output html
      - uses: actions/upload-artifact@v4
        with:
          name: vibe-gate-report
          path: '*.html'
```

Or trigger manually from the Actions tab with the `scan-check.yml` workflow — set a URL and minimum grade threshold.

## Requirements

- **Node.js 18+** (Node 20+ recommended)
- **Playwright** — auto-installed on first run via `npx playwright install chromium`
- Internet access for remote URL scanning

## What It Checks

| Category | Checks | Weight |
|----------|--------|--------|
| **Page Health** | Load success, console errors, load time, broken routes | 15% |
| **Security Headers** | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy | 25% |
| **Secrets Exposure** | API keys, tokens, passwords in source code | 20% |
| **Auth Coverage** | Unprotected admin routes, missing auth on APIs | 20% |
| **Mixed Content** | HTTP resources on HTTPS pages | 10% |
| **SSL/TLS** | Certificate validity, HSTS preload | 10% |

## Grading

| Grade | Score | Meaning |
|-------|-------|---------|
| **A** | 90-100 | Production-ready |
| **B** | 80-89 | Minor issues |
| **C** | 70-79 | Needs work before ship |
| **D** | 60-69 | Significant issues |
| **F** | 0-59 | Do not ship |

## Reports

- **Terminal**: Color-coded output with pass/warn/fail per check
- **HTML**: Self-contained standalone report (open in browser, share with team)
- **JSON**: Machine-readable output for CI pipelines

## License

MIT — free for any use.
