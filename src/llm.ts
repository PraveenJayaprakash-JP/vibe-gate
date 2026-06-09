import { buildAnalysisPrompt } from './prompts.js';
import type { ScanResult, CheckResult } from './types.js';
import type { VibeGateConfig } from './config.js';

// ── Enhanced types ────────────────────────────────────────────────

export interface EnhancedFinding {
  check: string;
  plainEnglish: string;
  severity: string;
  fixSteps: string[];
}

export interface EnhancedResult extends ScanResult {
  plainEnglishSummary?: string;
  enhancedFindings?: EnhancedFinding[];
  fixInstructions?: string[];
}

interface LlmJsonResponse {
  summary: string;
  findings: Array<{
    check: string;
    plainEnglish: string;
    severity: string;
    fixSteps: string[];
  }>;
}

// ── Provider dispatch ─────────────────────────────────────────────

/** Required env-var names for each provider when apiKey is absent from config. */
const ENV_KEY_NAMES: Record<VibeGateConfig['llm'] extends { provider: infer P }
  ? P extends string ? P : never
  : string, string> = {
  google: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

/** Default model IDs per provider (used when config.llm.model is absent). */
const DEFAULT_MODELS: Record<string, string> = {
  google: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku-20240307',
};

// ── Public API ────────────────────────────────────────────────────

/**
 * Enhance a raw {@link ScanResult} with plain-English explanations
 * produced by a free/cheap LLM.
 *
 * If no API key is configured or the LLM call fails for any reason
 * the original result is returned unchanged (graceful degradation).
 */
export async function enhanceWithLlm(
  result: ScanResult,
  url: string,
  config: VibeGateConfig,
): Promise<EnhancedResult> {
  // ── Resolve API key ───────────────────────────────────────────
  const provider = config.llm?.provider;
  if (!provider) return result; // LLM not configured

  const apiKey = config.llm?.apiKey ?? process.env[ENV_KEY_NAMES[provider]] ?? '';
  if (!apiKey) return result; // no key anywhere

  // ── Build the prompt ──────────────────────────────────────────
  const prompt = buildAnalysisPrompt(url, result);

  // ── Call the LLM ──────────────────────────────────────────────
  let rawText: string;
  try {
    rawText = await callLlmWithTimeout(provider, apiKey, config.llm?.model, prompt);
  } catch {
    return result; // degrade silently
  }

  // ── Parse the response ────────────────────────────────────────
  let parsed: LlmJsonResponse;
  try {
    parsed = parseLlmJson(rawText);
  } catch {
    return result;
  }

  // ── Validate shape ────────────────────────────────────────────
  if (!isValidLlmResponse(parsed)) return result;

  // ── Merge into result ─────────────────────────────────────────
  const enhanced: EnhancedResult = {
    ...result,
    plainEnglishSummary: parsed.summary,
    enhancedFindings: parsed.findings.map((f) => ({
      check: f.check,
      plainEnglish: f.plainEnglish,
      severity: f.severity,
      fixSteps: f.fixSteps,
    })),
    fixInstructions: parsed.findings.flatMap((f) => f.fixSteps),
    recommendations: [
      ...result.recommendations,
      '✨ Enhanced with AI analysis — see "plainEnglish" explanations above.',
    ],
  };

  return enhanced;
}

// ── LLM call helpers ─────────────────────────────────────────────

async function callLlmWithTimeout(
  provider: string,
  apiKey: string,
  modelOverride: string | undefined,
  prompt: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const text = await callProvider(provider, apiKey, modelOverride, prompt, controller.signal);
    clearTimeout(timer);
    return text;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/** Route to the correct provider implementation. */
async function callProvider(
  provider: string,
  apiKey: string,
  modelOverride: string | undefined,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  switch (provider) {
    case 'google':
      return callGoogle(apiKey, modelOverride, prompt, signal);
    case 'openai':
      return callOpenAi(apiKey, modelOverride, prompt, signal);
    case 'anthropic':
      return callAnthropic(apiKey, modelOverride, prompt, signal);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

// ── Provider-specific implementations ────────────────────────────

async function callGoogle(
  apiKey: string,
  modelOverride: string | undefined,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  const model = modelOverride ?? DEFAULT_MODELS.google;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
    signal,
  });

  if (res.status === 429) throw new Error('Gemini rate limited');
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(data.error.message);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

async function callOpenAi(
  apiKey: string,
  modelOverride: string | undefined,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  const model = modelOverride ?? DEFAULT_MODELS.openai;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    }),
    signal,
  });

  if (res.status === 429) throw new Error('OpenAI rate limited');
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(data.error.message);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned empty response');
  return text;
}

async function callAnthropic(
  apiKey: string,
  modelOverride: string | undefined,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  const model = modelOverride ?? DEFAULT_MODELS.anthropic;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal,
  });

  if (res.status === 429) throw new Error('Anthropic rate limited');
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);

  const data = (await res.json()) as {
    content?: Array<{ text?: string }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(data.error.message);
  const block = data.content?.find((c) => c.text !== undefined);
  if (!block?.text) throw new Error('Anthropic returned empty response');
  return block.text;
}

// ── Response parsing ─────────────────────────────────────────────

/** Extract JSON from a raw LLM response that may be wrapped in markdown fences. */
function parseLlmJson(raw: string): LlmJsonResponse {
  // Strip markdown code fences if present
  let json = raw.trim();
  if (json.startsWith('```')) {
    const firstNewline = json.indexOf('\n');
    json = json.slice(firstNewline + 1);
    const lastFence = json.lastIndexOf('```');
    if (lastFence !== -1) json = json.slice(0, lastFence);
    json = json.trim();
  }
  return JSON.parse(json) as LlmJsonResponse;
}

/** Lightweight structural validation of the parsed LLM output. */
function isValidLlmResponse(o: LlmJsonResponse): boolean {
  if (typeof o.summary !== 'string' || o.summary.length === 0) return false;
  if (!Array.isArray(o.findings) || o.findings.length === 0) return false;
  for (const f of o.findings) {
    if (typeof f.check !== 'string') return false;
    if (typeof f.plainEnglish !== 'string') return false;
    if (!Array.isArray(f.fixSteps) || !f.fixSteps.every((s) => typeof s === 'string')) {
      return false;
    }
  }
  return true;
}
