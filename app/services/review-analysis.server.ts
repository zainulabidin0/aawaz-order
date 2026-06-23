export type EnglishSentimentResult = {
  sentiment: string;
  label: number;
  score?: number;
  confidence?: number;
};

export type RomanSentimentResult = {
  sentiment: string;
  confidence?: number;
};

export type ReviewPrediction = {
  review: string;
  english_sentiment?: EnglishSentimentResult;
  roman_sentiment?: RomanSentimentResult;
  warnings?: string[];
};

function serviceUrl() {
  const url = process.env.REVIEW_ANALYSIS_SERVICE_URL?.replace(/\/+$/, "");
  if (!url) {
    throw new Error(
      "REVIEW_ANALYSIS_SERVICE_URL is not configured. Deploy review-analysis on Render and set the URL."
    );
  }
  return url;
}

/** Render free tier can take 30–60s to wake; Vercel allows up to 60s on this route. */
const SERVICE_TIMEOUT_MS = 55_000;

function modelsReady(data: Record<string, unknown>): boolean {
  if (data.models_loaded === true) return true;
  if (data.model_loaded === true) return true;
  // Some deployments only return status without a boolean flag
  return data.status === "ok" && data.models_loaded === undefined && data.model_loaded === undefined;
}

export async function predictReviewSentiment(
  review: string
): Promise<ReviewPrediction> {
  const response = await fetch(`${serviceUrl()}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ review }),
    signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Review analysis service error (${response.status}): ${detail.slice(0, 200)}`
    );
  }

  const body = (await response.json()) as Record<string, unknown>;
  return normalizePredictionResponse(body, review);
}

/** Map our dual-model API or legacy single-model `{ sentiment, score }` responses. */
export function normalizePredictionResponse(
  body: Record<string, unknown>,
  review: string,
): ReviewPrediction {
  if (body.english_sentiment || body.roman_sentiment) {
    return {
      review: String(body.review ?? review),
      english_sentiment: body.english_sentiment as
        | EnglishSentimentResult
        | undefined,
      roman_sentiment: body.roman_sentiment as RomanSentimentResult | undefined,
      warnings: body.warnings as string[] | undefined,
    };
  }

  const rawSentiment = String(body.sentiment ?? "").trim();
  if (!rawSentiment) {
    throw new Error("Review service returned no sentiment data");
  }

  const score = typeof body.score === "number" ? body.score : undefined;
  const confidence =
    typeof body.confidence === "number" ? body.confidence : undefined;
  const label =
    score === 1
      ? 1
      : score === -1
        ? 0
        : rawSentiment.toLowerCase().includes("pos")
          ? 1
          : 0;
  const sentiment =
    rawSentiment.charAt(0).toUpperCase() +
    rawSentiment.slice(1).toLowerCase();

  const englishBlock: EnglishSentimentResult = {
    sentiment,
    label,
    score,
    confidence,
  };

  const romanBlock: RomanSentimentResult = { sentiment, confidence };

  if (looksLikeRomanUrdu(review)) {
    return {
      review: String(body.review ?? review),
      roman_sentiment: romanBlock,
    };
  }

  return {
    review: String(body.review ?? review),
    english_sentiment: englishBlock,
  };
}

function looksLikeRomanUrdu(text: string): boolean {
  if (/[\u0600-\u06FF]/.test(text)) return true;
  return /\b(bohat|bahut|acha|achha|achhi|buri|bura|kharab|nai|nahi|nahin|hai|thi|tha|theen|shukriya|mazay|delivery)\b/i.test(
    text,
  );
}

export async function checkReviewAnalysisHealth(): Promise<{
  ok: boolean;
  modelsLoaded?: boolean;
  error?: string;
}> {
  const url = `${serviceUrl()}/health`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { ok: false, error: `Health check failed (${response.status})` };
      }
      const data = (await response.json()) as Record<string, unknown>;
      const loaded = modelsReady(data);
      if (loaded) {
        return { ok: true, modelsLoaded: true };
      }
      return {
        ok: false,
        modelsLoaded: false,
        error: "Service responded but sentiment models are not loaded",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Health check failed";
      const isTimeout =
        message.includes("timeout") || message.includes("aborted");
      if (attempt === 1 && isTimeout) {
        console.warn(
          `[review-analysis] health timeout (attempt ${attempt}), retrying — Render may be waking up`,
        );
        continue;
      }
      return {
        ok: false,
        error: isTimeout
          ? "Service timed out. Render free tier may be waking up — try again in a minute."
          : message,
      };
    }
  }

  return { ok: false, error: "Could not reach review analysis service" };
}

export function isPositiveEnglishSentiment(sentiment: string | null | undefined) {
  if (!sentiment) return false;
  const normalized = sentiment.toLowerCase();
  return normalized === "positive" || normalized === "pos";
}

export function isPositiveRomanSentiment(sentiment: string | null | undefined) {
  if (!sentiment) return false;
  const normalized = sentiment.toLowerCase();
  return (
    normalized.includes("positive") ||
    normalized.includes("pos") ||
    normalized === "1"
  );
}

export type ReviewStats = {
  total: number;
  englishPositive: number;
  englishNegative: number;
  romanPositive: number;
  romanNegative: number;
  romanOther: number;
  timeline: Array<{
    date: string;
    englishPositive: number;
    englishNegative: number;
    total: number;
  }>;
};

export function buildReviewStats(
  rows: Array<{
    englishSentiment: string | null;
    romanSentiment: string | null;
    createdAt: Date;
  }>
): ReviewStats {
  let englishPositive = 0;
  let englishNegative = 0;
  let romanPositive = 0;
  let romanNegative = 0;
  let romanOther = 0;

  const dayMap = new Map<
    string,
    { englishPositive: number; englishNegative: number; total: number }
  >();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  for (const row of rows) {
    if (isPositiveEnglishSentiment(row.englishSentiment)) {
      englishPositive += 1;
    } else if (row.englishSentiment) {
      englishNegative += 1;
    }

    if (row.romanSentiment) {
      if (isPositiveRomanSentiment(row.romanSentiment)) {
        romanPositive += 1;
      } else if (
        row.romanSentiment.toLowerCase().includes("negative") ||
        row.romanSentiment.toLowerCase().includes("neg")
      ) {
        romanNegative += 1;
      } else {
        romanOther += 1;
      }
    }

    if (row.createdAt >= thirtyDaysAgo) {
      const date = row.createdAt.toISOString().slice(0, 10);
      const entry = dayMap.get(date) ?? {
        englishPositive: 0,
        englishNegative: 0,
        total: 0,
      };
      entry.total += 1;
      if (isPositiveEnglishSentiment(row.englishSentiment)) {
        entry.englishPositive += 1;
      } else if (row.englishSentiment) {
        entry.englishNegative += 1;
      }
      dayMap.set(date, entry);
    }
  }

  const timeline = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  return {
    total: rows.length,
    englishPositive,
    englishNegative,
    romanPositive,
    romanNegative,
    romanOther,
    timeline,
  };
}
