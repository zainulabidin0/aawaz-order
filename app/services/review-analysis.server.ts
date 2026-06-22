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

export async function predictReviewSentiment(
  review: string
): Promise<ReviewPrediction> {
  const response = await fetch(`${serviceUrl()}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ review }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Review analysis service error (${response.status}): ${detail.slice(0, 200)}`
    );
  }

  return response.json() as Promise<ReviewPrediction>;
}

export async function checkReviewAnalysisHealth(): Promise<{
  ok: boolean;
  modelsLoaded?: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(`${serviceUrl()}/health`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return { ok: false, error: `Health check failed (${response.status})` };
    }
    const data = (await response.json()) as {
      status: string;
      models_loaded: boolean;
    };
    return {
      ok: data.status === "ok" && data.models_loaded,
      modelsLoaded: data.models_loaded,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Health check failed",
    };
  }
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
