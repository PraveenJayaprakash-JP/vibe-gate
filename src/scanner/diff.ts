/// <reference lib="dom" />

import { chromium, type Browser } from 'playwright';
import { homedir } from 'node:os';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScreenshotDiffReport {
  /** Whether any pixels differ between the two screenshots. */
  changed: boolean;
  /** Percentage of pixels that changed (0–100). */
  diffPercent: number;
  /** Base64-encoded PNG of the visual diff overlay. */
  diffImageBase64: string;
  /** Verdict based on the configured threshold. */
  verdict: 'pass' | 'warn' | 'fail';
  /** Human-readable summary of the comparison. */
  message: string;
  /** Width of the diff image in pixels. */
  width: number;
  /** Height of the diff image in pixels. */
  height: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic string hash from character codes.
 * Uses the classic DJB2-like algorithm — no crypto dependency needed.
 */
function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0; // clamp to 32-bit signed int
  }
  return Math.abs(hash).toString(16);
}

/** Directory where screenshots for a given URL are persisted. */
function screenshotDir(url: string): string {
  return join(homedir(), '.vibe-gate', 'screenshots', hashUrl(url));
}

/** Full filesystem path to the latest screenshot for a URL. */
function screenshotPath(url: string): string {
  return join(screenshotDir(url), 'latest.png');
}

/**
 * Turn a pixel-change percentage into a verdict + message.
 *
 * Default thresholds (configurable via `threshold` parameter):
 *   < threshold  → pass
 *   threshold–5× → warn
 *   > 5×         → fail
 */
function determineVerdict(
  diffPercent: number,
  threshold: number,
): { verdict: ScreenshotDiffReport['verdict']; message: string } {
  if (diffPercent < threshold) {
    return {
      verdict: 'pass',
      message: `No significant visual changes detected (${diffPercent.toFixed(2)}% < ${threshold}% threshold)`,
    };
  }
  if (diffPercent < threshold * 5) {
    return {
      verdict: 'warn',
      message: `Minor visual changes detected (${diffPercent.toFixed(2)}% changed) — review recommended`,
    };
  }
  return {
    verdict: 'fail',
    message: `Significant visual regression detected (${diffPercent.toFixed(2)}% changed) — requires investigation`,
  };
}

// ---------------------------------------------------------------------------
// Core diff
// ---------------------------------------------------------------------------

/**
 * Compare two base64-encoded PNG screenshots using Playwright's Chromium
 * to perform pixel-level analysis on an offscreen canvas.
 *
 * No external image-processing libraries required (no sharp, no pixelmatch).
 *
 * @param beforeBase64 - Base64-encoded PNG of the reference screenshot.
 * @param afterBase64  - Base64-encoded PNG of the current screenshot.
 * @param threshold    - Pass/warn boundary percentage (default: 1).  Warn/fail
 *                       boundary is 5× threshold.
 * @returns A structured diff report with pixel-change percentage, diff image,
 *          and pass/warn/fail verdict.
 */
export async function diffScreenshots(
  beforeBase64: string,
  afterBase64: string,
  threshold = 1,
): Promise<ScreenshotDiffReport> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    // Minimal page — the evaluate callback does all the heavy lifting.
    await page.setContent(
      '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>',
    );

    const beforeSrc = `data:image/png;base64,${beforeBase64}`;
    const afterSrc = `data:image/png;base64,${afterBase64}`;

    const diffResult = await page.evaluate(
      async ({ beforeSrc, afterSrc }: { beforeSrc: string; afterSrc: string }) => {
        // ---- load helper --------------------------------------------------
        function loadImage(src: string): Promise<HTMLImageElement> {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load screenshot image'));
            img.src = src;
          });
        }

        // ---- load both images ---------------------------------------------
        const [img1, img2] = await Promise.all([
          loadImage(beforeSrc),
          loadImage(afterSrc),
        ]);

        // Use the maximum dimensions so both images fit.
        const w = Math.max(img1.width, img2.width);
        const h = Math.max(img1.height, img2.height);

        // ---- render images to canvases ------------------------------------
        function renderToCanvas(img: HTMLImageElement): ImageData {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, w, h);
        }

        const data1 = renderToCanvas(img1).data;
        const data2 = renderToCanvas(img2).data;

        // ---- build diff image ---------------------------------------------
        const diffCanvas = document.createElement('canvas');
        diffCanvas.width = w;
        diffCanvas.height = h;
        const diffCtx = diffCanvas.getContext('2d')!;
        const diffImageData = diffCtx.createImageData(w, h);
        const diffData = diffImageData.data;

        let changedPixels = 0;
        const totalPixels = w * h;

        for (let i = 0; i < diffData.length; i += 4) {
          // Compare R, G, B channels (ignore alpha).
          const match =
            data1[i] === data2[i] &&
            data1[i + 1] === data2[i + 1] &&
            data1[i + 2] === data2[i + 2];

          if (match) {
            // Green overlay at ~20 % opacity for matching pixels.
            diffData[i] = 0;
            diffData[i + 1] = 255;
            diffData[i + 2] = 0;
            diffData[i + 3] = 51;
          } else {
            // Solid red for changed pixels.
            diffData[i] = 255;
            diffData[i + 1] = 0;
            diffData[i + 2] = 0;
            diffData[i + 3] = 255;
            changedPixels++;
          }
        }

        diffCtx.putImageData(diffImageData, 0, 0);

        // ---- encode diff image to base64 ----------------------------------
        const fullDataUrl = diffCanvas.toDataURL('image/png');
        const diffBase64 = fullDataUrl.replace(/^data:image\/png;base64,/, '');
        const diffPercent = totalPixels > 0 ? (changedPixels / totalPixels) * 100 : 0;

        return { diffPercent, diffImageBase64: diffBase64, width: w, height: h };
      },
      { beforeSrc, afterSrc },
    );

    await context.close();

    const { verdict, message } = determineVerdict(diffResult.diffPercent, threshold);

    return {
      changed: diffResult.diffPercent > 0,
      diffPercent: diffResult.diffPercent,
      diffImageBase64: diffResult.diffImageBase64,
      verdict,
      message,
      width: diffResult.width,
      height: diffResult.height,
    };
  } finally {
    if (browser) await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Persist a screenshot to `~/.vibe-gate/screenshots/{url-hash}/latest.png`.
 *
 * @param url    - The scanned page URL (used to derive the storage path).
 * @param base64 - Raw base64-encoded PNG string (no data-URI prefix).
 * @returns The absolute file path where the screenshot was written.
 */
export async function saveScreenshot(url: string, base64: string): Promise<string> {
  const dir = screenshotDir(url);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(base64, 'base64');
  const filePath = screenshotPath(url);
  await writeFile(filePath, buffer);

  return filePath;
}

/**
 * Retrieve the previously saved screenshot for a URL.
 *
 * @param url - The scanned page URL.
 * @returns The base64-encoded PNG string, or `null` if no screenshot exists
 *          (first scan, or the file was deleted).
 */
export async function getPreviousScreenshot(url: string): Promise<string | null> {
  try {
    const buffer = await readFile(screenshotPath(url));
    return buffer.toString('base64');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Compare the current screenshot against the previously saved one.
 *
 * Saves `currentBase64` as the new latest screenshot, then diffs it against
 * whatever was stored previously.  Designed to be called by the scanner
 * orchestrator after `scanPlaywright` completes.
 *
 * @param url           - The scanned page URL.
 * @param currentBase64 - Base64-encoded PNG of the current scan's screenshot.
 * @returns A `ScreenshotDiffReport` if a previous screenshot existed,
 *          or `null` on the very first scan (no baseline to compare against).
 */
export async function compareWithPrevious(
  url: string,
  currentBase64: string,
): Promise<ScreenshotDiffReport | null> {
  const previousBase64 = await getPreviousScreenshot(url);

  // Always persist the current screenshot so it becomes the baseline for the
  // next scan — even when no previous exists.
  await saveScreenshot(url, currentBase64);

  if (!previousBase64) {
    return null;
  }

  return diffScreenshots(previousBase64, currentBase64);
}
