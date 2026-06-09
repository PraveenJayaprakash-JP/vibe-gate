# Vibe Gate — Quality Gate for AI-Generated Web Apps

## Mission
Free, open-source CLI that scans any web app (especially AI-generated) for broken flows, security holes, and auth gaps. Reports in plain English. Zero cost to run.

## Commands
```
npx vibe-gate <url>         # Scan a deployed web app
npx vibe-gate scan .        # Scan local codebase
npx vibe-gate init          # Create config
```

## Architecture

```
vibe-gate/
├── package.json
├── tsconfig.json
├── bin/vibe-gate.js        # CLI entry (#!/usr/bin/env node)
├── src/
│   ├── index.ts            # CLI wiring (commander)
│   ├── types.ts            # Shared types
│   ├── scanner/
│   │   ├── index.ts        # Orchestrator - runs all scans
│   │   ├── playwright.ts   # Browser-based flow checks
│   │   ├── security.ts     # Security scan (headers, secrets, CSP)
│   │   └── auth.ts         # Auth coverage scan
│   └── reporter/
│       ├── index.ts        # Report orchestration
│       └── html.ts         # HTML report generator
└── test/
    └── fixtures/           # Test fixtures
```

## Scan Modules

### 1. Playwright Scanner (`playwright.ts`)
- Navigate to URL, confirm page loads
- Check console for errors (404s, JS errors)
- Check common routes: /api, /health, /admin, /login, /signup
- Check form behavior (empty submit, XSS attempt)
- Take screenshot for report
- Measure page load performance

### 2. Security Scanner (`security.ts`)
- Check HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- Scan HTML source for exposed secrets (API keys, tokens in comments/JS)
- Check for mixed content (http resources on https page)
- Check SSL/TLS (valid cert, HSTS preload)
- CORS configuration analysis

### 3. Auth Coverage (`auth.ts`)
- Route discovery (find all routes from page links, sitemap, common patterns)
- Check which routes require auth vs public
- Check if /api routes have auth protection
- Check login page behavior
- Check for missing auth on sensitive routes

### 4. Reporter (`reporter/`)
- Terminal output with color-coded grade (A-F)
- HTML report with details
- Summary: PASS/FAIL/WARN per category
- Plain English explanations (no jargon)

## Grading (A-F)
- A (90-100): Production-ready
- B (80-89): Minor issues
- C (70-79): Needs work
- D (60-69): Significant issues
- F (0-59): Do not ship

## Weights
- Page Load: 15%
- Console Errors: 20%
- Security Headers: 25%
- Secrets Exposure: 20%
- Auth Coverage: 20%

## MVP Scope (v0.1.0)
- [x] Single URL scan
- [x] Playwright page load + console check
- [x] Security headers check
- [x] Secrets scan (HTML source)
- [x] Auth route detection
- [x] Terminal report (color-coded)
- [x] HTML report
- [x] npx zero-install distribution

## Zero-Cost Stack
- Playwright (OSS) — browser automation
- Node.js/TypeScript — runtime
- Commander + Chalk — CLI + terminal output
- npm/GitHub — distribution (free)
- Vercel — optional report hosting (free tier)
