import {
  BlockStack,
  Box,
  Card,
  InlineStack,
  Text,
} from "@shopify/polaris";
import type { ReviewStats } from "../services/review-analysis.server";

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function DonutChart({
  positive,
  negative,
  total,
  positiveColor,
  negativeColor,
}: {
  positive: number;
  negative: number;
  total: number;
  positiveColor: string;
  negativeColor: string;
}) {
  const size = 140;
  const stroke = 20;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const positiveLen = total > 0 ? (positive / total) * circumference : 0;
  const negativeLen = total > 0 ? (negative / total) * circumference : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e4e5e7"
          strokeWidth={stroke}
        />
        {positiveLen > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={positiveColor}
            strokeWidth={stroke}
            strokeDasharray={`${positiveLen} ${circumference - positiveLen}`}
            strokeLinecap="round"
          />
        )}
        {negativeLen > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={negativeColor}
            strokeWidth={stroke}
            strokeDasharray={`${negativeLen} ${circumference - negativeLen}`}
            strokeDashoffset={-positiveLen}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div
        style={{
          marginTop: -88,
          height: 88,
          width: 88,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text as="span" variant="headingLg" fontWeight="bold">
          {total}
        </Text>
        <Text as="span" variant="bodySm" tone="subdued">
          reviews
        </Text>
      </div>
    </div>
  );
}

function BarChart({
  positive,
  negative,
  total,
  positiveLabel,
  negativeLabel,
  positiveColor,
  negativeColor,
}: {
  positive: number;
  negative: number;
  total: number;
  positiveLabel: string;
  negativeLabel: string;
  positiveColor: string;
  negativeColor: string;
}) {
  const positivePct = total > 0 ? (positive / total) * 100 : 0;
  const negativePct = total > 0 ? (negative / total) * 100 : 0;

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <InlineStack align="space-between">
          <Text as="span" tone="success">
            {positiveLabel}
          </Text>
          <Text as="span" variant="bodySm">
            {positive} ({pct(positive, total)}%)
          </Text>
        </InlineStack>
        <div
          style={{
            height: 12,
            borderRadius: 6,
            background: "#e4e5e7",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${positivePct}%`,
              background: positiveColor,
              borderRadius: 6,
            }}
          />
        </div>
      </BlockStack>
      <BlockStack gap="100">
        <InlineStack align="space-between">
          <Text as="span" tone="critical">
            {negativeLabel}
          </Text>
          <Text as="span" variant="bodySm">
            {negative} ({pct(negative, total)}%)
          </Text>
        </InlineStack>
        <div
          style={{
            height: 12,
            borderRadius: 6,
            background: "#e4e5e7",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${negativePct}%`,
              background: negativeColor,
              borderRadius: 6,
            }}
          />
        </div>
      </BlockStack>
    </BlockStack>
  );
}

function TimelineChart({
  timeline,
}: {
  timeline: ReviewStats["timeline"];
}) {
  if (timeline.length === 0) {
    return (
      <Text as="p" tone="subdued">
        No reviews in the last 30 days yet. Use the playground to analyze reviews.
      </Text>
    );
  }

  const maxTotal = Math.max(...timeline.map((d) => d.total), 1);
  const chartHeight = 120;
  const barWidth = Math.min(28, Math.max(8, 480 / timeline.length - 4));

  return (
    <BlockStack gap="300">
      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 4,
            minHeight: chartHeight + 28,
          }}
        >
          {timeline.map((day) => {
            const posH = (day.englishPositive / maxTotal) * chartHeight;
            const negH = (day.englishNegative / maxTotal) * chartHeight;
            const label = new Date(day.date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
            return (
              <div
                key={day.date}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
                title={`${label}: ${day.englishPositive} positive, ${day.englishNegative} negative`}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    height: chartHeight,
                    width: barWidth,
                  }}
                >
                  {day.englishNegative > 0 && (
                    <div
                      style={{
                        width: "100%",
                        height: negH,
                        background: "#ef4444",
                        borderTopLeftRadius: 2,
                        borderTopRightRadius: 2,
                      }}
                    />
                  )}
                  {day.englishPositive > 0 && (
                    <div
                      style={{
                        width: "100%",
                        height: posH,
                        background: "#16a34a",
                        borderTopLeftRadius: day.englishNegative > 0 ? 0 : 2,
                        borderTopRightRadius: day.englishNegative > 0 ? 0 : 2,
                      }}
                    />
                  )}
                </div>
                <span style={{ fontSize: 10, color: "#6d7175", maxWidth: 48, overflow: "hidden" }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <InlineStack gap="400">
        <InlineStack gap="100" blockAlign="center">
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "#16a34a",
            }}
          />
          <Text as="span" variant="bodySm" tone="subdued">
            English positive
          </Text>
        </InlineStack>
        <InlineStack gap="100" blockAlign="center">
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "#ef4444",
            }}
          />
          <Text as="span" variant="bodySm" tone="subdued">
            English negative
          </Text>
        </InlineStack>
      </InlineStack>
    </BlockStack>
  );
}

export function ReviewStatsCharts({ stats }: { stats: ReviewStats }) {
  const englishTotal = stats.englishPositive + stats.englishNegative;
  const romanTotal =
    stats.romanPositive + stats.romanNegative + stats.romanOther;

  return (
    <BlockStack gap="400">
      <InlineStack gap="400" wrap>
        <StatCard
          label="Total analyses"
          value={String(stats.total)}
          color="#2563eb"
        />
        <StatCard
          label="English positive"
          value={String(stats.englishPositive)}
          color="#16a34a"
        />
        <StatCard
          label="English negative"
          value={String(stats.englishNegative)}
          color="#dc2626"
        />
        <StatCard
          label="Roman positive"
          value={String(stats.romanPositive)}
          color="#7c3aed"
        />
      </InlineStack>

      <InlineStack gap="400" align="start" wrap={false}>
        <Box minWidth="320px" width="100%">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                English sentiment
              </Text>
              <Text as="p" tone="subdued">
                Positive vs negative (English model)
              </Text>
              {englishTotal === 0 ? (
                <Text as="p" tone="subdued">
                  No English results yet.
                </Text>
              ) : (
                <InlineStack gap="600" align="center" wrap>
                  <DonutChart
                    positive={stats.englishPositive}
                    negative={stats.englishNegative}
                    total={englishTotal}
                    positiveColor="#16a34a"
                    negativeColor="#ef4444"
                  />
                  <Box minWidth="200px" width="100%">
                    <BarChart
                      positive={stats.englishPositive}
                      negative={stats.englishNegative}
                      total={englishTotal}
                      positiveLabel="Positive"
                      negativeLabel="Negative"
                      positiveColor="#16a34a"
                      negativeColor="#ef4444"
                    />
                  </Box>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Box>

        <Box minWidth="320px" width="100%">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Roman Urdu sentiment
              </Text>
              <Text as="p" tone="subdued">
                Positive vs negative (Roman Urdu model)
              </Text>
              {romanTotal === 0 ? (
                <Text as="p" tone="subdued">
                  No Roman Urdu results yet.
                </Text>
              ) : (
                <InlineStack gap="600" align="center" wrap>
                  <DonutChart
                    positive={stats.romanPositive}
                    negative={stats.romanNegative}
                    total={stats.romanPositive + stats.romanNegative || romanTotal}
                    positiveColor="#7c3aed"
                    negativeColor="#f97316"
                  />
                  <Box minWidth="200px" width="100%">
                    <BarChart
                      positive={stats.romanPositive}
                      negative={stats.romanNegative}
                      total={stats.romanPositive + stats.romanNegative || 1}
                      positiveLabel="Positive"
                      negativeLabel="Negative"
                      positiveColor="#7c3aed"
                      negativeColor="#f97316"
                    />
                  </Box>
                </InlineStack>
              )}
              {stats.romanOther > 0 && (
                <Text as="p" variant="bodySm" tone="subdued">
                  {stats.romanOther} review(s) with other Roman labels
                </Text>
              )}
            </BlockStack>
          </Card>
        </Box>
      </InlineStack>

      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Last 30 days
          </Text>
          <Text as="p" tone="subdued">
            Daily English sentiment volume
          </Text>
          <TimelineChart timeline={stats.timeline} />
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Box
      background="bg-surface"
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
      padding="400"
      minWidth="140px"
    >
      <BlockStack gap="100">
        <Text as="p" variant="headingXl" fontWeight="bold">
          <span style={{ color }}>{value}</span>
        </Text>
        <Text as="p" variant="bodyMd" fontWeight="semibold">
          {label}
        </Text>
      </BlockStack>
    </Box>
  );
}
