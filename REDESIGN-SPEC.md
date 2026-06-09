# Exact Design Spec — Pixel Perfect Match

Reference file: C:\Users\PRAVEEN\Downloads\vibe-gate-redesign.html

## Design Tokens (EXACT)
- Accent: #00d4aa (teal). Light mode: #00826a
- Fonts: Inter (body, 300-700) + Geist Mono (code, 400-600) via Google Fonts
- Dark bg: #0a0a0b surfaces: #111113 → #161618 → #1c1c1f → #222226
- Light bg: #f8f8f7 surfaces: #ffffff → #f3f3f1 → #eceae7 → #e6e4e0
- All text sizes use clamp() — fluid typography
- Radii: --radius-full: 9999px (PILL SHAPES for buttons, nav buttons, tags)
- Transition: 180ms cubic-bezier(0.16, 1, 0.3, 1)
- Content max-width: 960px default, 1200px wide

## Nav (EXACT)
- Position fixed, OKLCH transparent bg: `oklch(from var(--bg) l c h / 0.85)`
- backdrop-filter: blur(20px), border-bottom: 1px solid var(--divider)
- Padding: var(--space-4) var(--space-8)
- Logo + center links (How it works, Checks, Pricing, FAQ) + right group (theme-toggle, GitHub btn-nav, Get Started btn-nav primary)
- btn-nav: pill shape (--radius-full), border 1px solid --border, small text
- btn-nav.primary: teal bg, BLACK text (#000), font-weight 600
- theme-toggle: 36x36 pill with border, sun SVG icon
- At 768px: nav padding shrinks, nav-links hidden (no hamburger)
- Logo SVG uses polyline for checkmark, stroke-width 2.2

## Hero (EXACT)
- 100dvh height, display grid place-items:center
- Radial gradients in hero-bg (teal at 50% -10% and 80% 60%)
- Hero-badge: pill, accent-dim bg, uppercase, letter-spaced, dot+text "Open source · MIT License"
- h1: text-3xl, weight 700, tight letter-spacing. Use `<em>` for teal accent text
- Hero-sub: text-lg, muted, 55ch max-width
- Two buttons in hero-ctas (pill shaped)
  - btn-primary: teal bg, BLACK text, glow shadow, "See how it works" with play SVG
  - btn-ghost: border, muted text, "View on GitHub" with GitHub SVG filled

## Terminal (EXACT)
- terminal-wrap: 600px max, radius-xl, border, shadow-lg
- terminal-bar: surface-3 bg, traffic light dots (ff5f57/febc2e/28c840), label "vibe-gate" right-aligned
- terminal-body: surface bg, mono text-xs
- t-line: flex gap-3, each line has status + label + score + dim note
- t-gap for spacing, t-grade for grade line (accent color)
- Term colors: t-pass=#22c55e, t-warn=#f59e0b, t-url=#818cf8, t-grade=accent

## Command Box (EXACT)
- cmd-box: inline-flex, surface-offset bg, border, radius-lg
- Contains $ prompt, code text, copy button
- Below terminal, centered with margin-top

## How It Works (EXACT)
- section-label: uppercase, letter-spaced, accent colored, with decorative line ::before (16px wide)
- section-title: text-2xl, weight 700
- section-desc: text-base, muted, 52ch
- how-grid: 3 columns, relative (has ::before connecting line with teal gradient)
- how-card: surface bg, border, radius-xl, hover lifts + teal border glow
- how-num: 40px circle, accent-dim bg, mono font, "01"/"02"/"03"

## Checks Bento Grid (EXACT)
- checks-bento: 6-column grid, gap-4
- check-card: surface bg, radius-xl, hover: teal border glow + shadow
- Spans: c1=2, c2=2, c3=2, c4=3, c5=3, c6=6
- c6 has c6-inner: 2-column grid with code block on right
- Percentage badge: top-right corner, mono font, pass color
- At 768px: 2 columns. At 480px: 1 column

## Pricing (EXACT)
- pricing-grid: 3 columns, gap-5, align-items:start
- pricing-card: surface, border, radius-xl
- .featured: teal border glow, gradient bg, shadow-md
- pricing-badge: absolute centered top, teal bg BLACK text, pill
- coming-badge: small pill above price in non-featured cards
- price-tier: uppercase, letter-spaced, xs text
- price-amount: flex baseline, .num (text-2xl) + .per (text-sm muted)
- price-divider: 1px line
- price-features: list with ::before pseudo-element checkmark circles (CSS data URI SVG)
- price-btn.accent: teal bg BLACK text, radius-lg, full width
- price-btn.ghost: border, muted text
- .dim: opacity 0.7 for non-featured cards

## FAQ (EXACT)
- faq-list: max-width 700px, vertical gap
- faq-item: border, radius-lg. .open class for active
- faq-q: surface bg, full width, flex space-between, chevron icon
- faq-chevron: rotates 180deg on open, turns accent color
- faq-a: display:none by default, .open display:block
- code in answers: mono, accent colored bg

## CTA Band (EXACT)
- cta-band: surface-offset bg, top+bottom borders
- Radial gradient overlay (teal)
- h2 + p + cta-cmd (inline-flex command with surface bg)

## Footer (EXACT)
- Top border divider
- footer-inner: flex space-between
- footer-links: xs text, faint color
- footer-copy: xs text, faint color, author link with underline

## Responsive (EXACT)
- 768px: nav padding smaller, nav-links hidden, how-grid→1col, checks-bento→2col, pricing→1col
- 480px: checks-bento→1col, c6-code hidden
- Container padding: 0 var(--space-8) desktop, 0 var(--space-4) mobile

## JS Features (EXACT)
1. Theme toggle: data-theme-toggle button, localStorage('theme'), prefers-color-scheme fallback, swap sun/moon SVGs
2. Copy command: select cmd-box text, clipboard API, "Copied!" feedback
3. Reveal animations: IntersectionObserver adding .visible class to .reveal elements
4. Sticky nav: add .scrolled class when scroll > 50px (darkens bg)

## Dashboard Reference Design
- Same nav, footer, theme toggle as landing page
- Hero section: title "Scan Results" + subtitle
- 3 states: loading (spinner), empty (info + CTAs), scan result (rendered from API)
- Scan card: same surface/border/radius styling as landing cards
- Grade letter: large (2.75rem), weight 800, colored (A/B=#22c55e, C=#f59e0b, D=#f97316, F=#ef4444)
- Category bars: progress bars with teal accent gradient fill
- Tags: .tag-pass/warn/error with dim bg and colored text (from reference)
