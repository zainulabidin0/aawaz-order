import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  Banner,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Divider,
  DataTable,
  EmptyState,
  Box,
} from "@shopify/polaris";
import { useCallback, useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { ReviewStatsCharts } from "../components/ReviewStatsCharts";
import {
  buildReviewStats,
  checkReviewAnalysisHealth,
  predictReviewSentiment,
} from "../services/review-analysis.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [reviews, health] = await Promise.all([
    db.reviewAnalysis.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    checkReviewAnalysisHealth().catch(() => ({
      ok: false,
      error: "REVIEW_ANALYSIS_SERVICE_URL not configured",
    })),
  ]);

  const allForStats = await db.reviewAnalysis.findMany({
    where: { shop },
    select: {
      englishSentiment: true,
      romanSentiment: true,
      createdAt: true,
    },
  });

  return json({
    shop,
    stats: buildReviewStats(allForStats),
    recentReviews: reviews,
    serviceUrl: process.env.REVIEW_ANALYSIS_SERVICE_URL ?? "",
    serviceHealth: health,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const review = String(formData.get("review") ?? "").trim();

  if (!review) {
    return json({ error: "Please enter a review to analyze." }, { status: 400 });
  }

  try {
    const prediction = await predictReviewSentiment(review);

    const saved = await db.reviewAnalysis.create({
      data: {
        shop,
        reviewText: review,
        englishSentiment: prediction.english_sentiment?.sentiment ?? null,
        englishLabel: prediction.english_sentiment?.label ?? null,
        englishConfidence: prediction.english_sentiment?.confidence ?? null,
        romanSentiment: prediction.roman_sentiment?.sentiment ?? null,
        romanConfidence: prediction.roman_sentiment?.confidence ?? null,
        source: "playground",
      },
    });

    return json({
      success: true,
      prediction,
      savedId: saved.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze review";
    return json({ error: message }, { status: 503 });
  }
}

export default function ReviewsPage() {
  const { stats, recentReviews, serviceUrl, serviceHealth } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isAnalyzing = navigation.state === "submitting";

  const [review, setReview] = useState("");

  const handleAnalyze = useCallback(() => {
    const data = new FormData();
    data.append("review", review);
    submit(data, { method: "post" });
  }, [review, submit]);

  const rows = recentReviews.map((item) => [
    <Text as="span" variant="bodyMd">
      <span style={{ display: "block", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
        {item.reviewText}
      </span>
    </Text>,
    sentimentBadge(item.englishSentiment),
    item.englishConfidence != null
      ? `${item.englishConfidence.toFixed(1)}%`
      : "—",
    sentimentBadge(item.romanSentiment, "info"),
    item.romanConfidence != null
      ? `${item.romanConfidence.toFixed(1)}%`
      : "—",
    new Date(item.createdAt).toLocaleDateString("en-PK", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  ]);

  return (
    <Page
      title="Review Analysis"
      subtitle="English + Roman Urdu sentiment — playground & stats"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        {!serviceUrl && (
          <Layout.Section>
            <Banner tone="warning" title="Review service URL not configured">
              <Text as="p">
                Deploy the Python service from <code>review-analysis/</code> on
                Render, then set <code>REVIEW_ANALYSIS_SERVICE_URL</code> in your
                Vercel environment (e.g.{" "}
                <code>https://aawaz-review-analysis.onrender.com</code>).
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {serviceUrl && !serviceHealth.ok && (
          <Layout.Section>
            <Banner tone="critical" title="Review analysis service unavailable">
              <Text as="p">
                Could not reach the sentiment service at{" "}
                <code>{serviceUrl}</code>.
              </Text>
              {serviceHealth.error && (
                <Text as="p" tone="subdued">
                  {serviceHealth.error}
                </Text>
              )}
              <Text as="p" tone="subdued">
                On Render free tier the service sleeps after inactivity and can
                take up to a minute to wake. Open the service URL in a browser,
                wait for it to load, then refresh this page.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {serviceUrl && serviceHealth.ok && (
          <Layout.Section>
            <Banner tone="success" title="Review analysis service connected">
              <Text as="p">
                Models loaded at <code>{serviceUrl}</code>
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {actionData && "error" in actionData && (
          <Layout.Section>
            <Banner tone="critical" title="Analysis failed">
              <Text as="p">{actionData.error}</Text>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Playground
              </Text>
              <Text as="p" tone="subdued">
                Paste a product review in English or Roman Urdu. Both models run
                and results are saved to your stats.
              </Text>
              <Divider />
              <TextField
                label="Review text"
                value={review}
                onChange={setReview}
                multiline={4}
                autoComplete="off"
                placeholder="e.g. bohat acha product hai, delivery bhi fast thi"
                helpText="Try English or Roman Urdu reviews"
              />
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  onClick={handleAnalyze}
                  loading={isAnalyzing}
                  disabled={!review.trim() || !serviceUrl}
                >
                  Analyze sentiment
                </Button>
              </InlineStack>

              {actionData && "success" in actionData && actionData.prediction && (
                <Box
                  background="bg-surface-secondary"
                  padding="400"
                  borderRadius="200"
                >
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">
                      Latest result
                    </Text>
                    <InlineStack gap="300" wrap>
                      {actionData.prediction.english_sentiment ? (
                        <ResultCard
                          title="English"
                          sentiment={
                            actionData.prediction.english_sentiment.sentiment
                          }
                          confidence={
                            actionData.prediction.english_sentiment.confidence
                          }
                        />
                      ) : null}
                      {actionData.prediction.roman_sentiment ? (
                        <ResultCard
                          title="Roman Urdu"
                          sentiment={
                            actionData.prediction.roman_sentiment.sentiment
                          }
                          confidence={
                            actionData.prediction.roman_sentiment.confidence
                          }
                        />
                      ) : null}
                    </InlineStack>
                    {!actionData.prediction.english_sentiment &&
                      !actionData.prediction.roman_sentiment && (
                        <Text as="p" tone="subdued">
                          No sentiment labels returned from the service.
                        </Text>
                      )}
                    {actionData.prediction.warnings &&
                      actionData.prediction.warnings.length > 0 && (
                        <Text as="p" tone="caution" variant="bodySm">
                          {actionData.prediction.warnings.join(" · ")}
                        </Text>
                      )}
                  </BlockStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <ReviewStatsCharts stats={stats} />
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Recent analyses
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Last 50 reviews
                </Text>
              </InlineStack>
              <Divider />
              {recentReviews.length === 0 ? (
                <EmptyState
                  heading="No reviews analyzed yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Use the playground above to analyze your first review.</p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "numeric",
                    "text",
                    "numeric",
                    "text",
                  ]}
                  headings={[
                    "Review",
                    "English",
                    "Conf.",
                    "Roman",
                    "Conf.",
                    "Date",
                  ]}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function sentimentBadge(sentiment: string | null, fallbackTone?: "info") {
  if (!sentiment) return <Badge>—</Badge>;
  const lower = sentiment.toLowerCase();
  if (lower.includes("positive") || lower === "pos") {
    return <Badge tone="success">{sentiment}</Badge>;
  }
  if (lower.includes("negative") || lower.includes("neg")) {
    return <Badge tone="critical">{sentiment}</Badge>;
  }
  return <Badge tone={fallbackTone}>{sentiment}</Badge>;
}

function ResultCard({
  title,
  sentiment,
  confidence,
}: {
  title: string;
  sentiment: string;
  confidence?: number;
}) {
  const lower = sentiment.toLowerCase();
  const tone =
    lower.includes("positive") || lower === "pos"
      ? "success"
      : lower.includes("negative") || lower.includes("neg")
        ? "critical"
        : undefined;

  return (
    <Box
      background="bg-surface"
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
      padding="300"
      minWidth="160px"
    >
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">
          {title}
        </Text>
        <Badge tone={tone}>{sentiment}</Badge>
        {confidence != null && (
          <Text as="p" variant="bodySm">
            Confidence: {confidence.toFixed(1)}%
          </Text>
        )}
      </BlockStack>
    </Box>
  );
}
