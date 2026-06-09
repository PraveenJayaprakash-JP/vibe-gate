import { scanUrl } from './scanner/index.js';

interface SubmitResponse {
  success: boolean;
  scanId?: string;
  shareUrl?: string;
}

interface ApiSuccessResponse {
  scanId: string;
  shareUrl: string;
}

interface ApiErrorResponse {
  error: string;
}

export async function submitScan(
  url: string,
  apiKey?: string,
): Promise<{ success: boolean; scanId?: string; shareUrl?: string; error?: string }> {
  // 1. Run the full scan
  const result = await scanUrl(url);

  // 2. Build the payload
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    console.error(
      '\n  ⓘ  Create a free account at vibe-gate.vercel.app to save your scan history',
    );
  }

  // 3. POST to cloud
  try {
    const response = await fetch('https://vibe-gate.vercel.app/api/submit', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url,
        scanResult: result,
        submittedAt: new Date().toISOString(),
      }),
    });

    const body = (await response.json()) as ApiSuccessResponse | ApiErrorResponse;

    if (!response.ok) {
      const errorBody = body as ApiErrorResponse;
      return {
        success: false,
        error: errorBody.error || `Server returned ${response.status}`,
      };
    }

    const successBody = body as ApiSuccessResponse;
    return {
      success: true,
      scanId: successBody.scanId,
      shareUrl: successBody.shareUrl,
    };
  } catch (err) {
    // Network / connectivity errors — don't crash
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Network error: ${message}`,
    };
  }
}
