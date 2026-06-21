import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Banner,
  Box,
  Divider,
  EmptyState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { themeAppEmbedUrl } from "../utils/theme-embed.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [totalOrders, confirmedOrders, pendingOrders, recentOrders, settings] =
    await Promise.all([
      db.voiceOrder.count({ where: { shop } }),
      db.voiceOrder.count({ where: { shop, status: "confirmed" } }),
      db.voiceOrder.count({ where: { shop, status: "pending" } }),
      db.voiceOrder.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.appSettings.findUnique({ where: { shop } }),
    ]);

  return json({
    shop,
    stats: { totalOrders, confirmedOrders, pendingOrders },
    recentOrders,
    settings,
    appUrl: process.env.SHOPIFY_APP_URL ?? "",
    themeEmbedUrl: themeAppEmbedUrl(
      shop,
      process.env.SHOPIFY_API_KEY ?? "",
    ),
  });
}

export default function Index() {
  const { stats, recentOrders, settings, shop, themeEmbedUrl } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const conversionRate =
    stats.totalOrders > 0
      ? ((stats.confirmedOrders / stats.totalOrders) * 100).toFixed(1)
      : "0";

  const statusBadge = (status: string) => {
    if (status === "confirmed")
      return <Badge tone="success">تصدیق شدہ</Badge>;
    if (status === "cancelled")
      return <Badge tone="critical">منسوخ</Badge>;
    return <Badge tone="attention">زیر التواء</Badge>;
  };

  const rows = recentOrders.map((order) => [
    <Text as="span" variant="bodyMd" fontWeight="semibold">
      {order.customerName}
    </Text>,
    order.phone,
    `${order.quantity} ${order.unit ?? ""} ${order.productTitle ?? order.productQuery}`,
    order.city ?? "—",
    statusBadge(order.status),
    order.shopifyOrderName ?? "—",
    new Date(order.createdAt).toLocaleDateString("ur-PK", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  ]);

  return (
    <Page
      title="Aawaz Order — Dashboard"
      subtitle="آواز آرڈر — پاکستانی گاہکوں کے لیے آواز سے آرڈر"
      primaryAction={{
        content: "Settings",
        onAction: () => navigate("/app/settings"),
      }}
    >
      <Layout>
        <Layout.Section>
          <Banner
            title="Enable the voice widget on your storefront"
            tone="warning"
            action={{
              content: "Open App embeds",
              url: themeEmbedUrl,
              external: true,
            }}
            secondaryAction={{
              content: "Configure Settings",
              onAction: () => navigate("/app/settings"),
            }}
          >
            <BlockStack gap="200">
              <Text as="p">
                In the theme editor, open <strong>App embeds</strong> and turn on{" "}
                <strong>Aawaz Order Widget</strong>. If it is missing, publish the
                theme extension with <code>shopify app deploy</code> from this
                project (Vercel deploy alone is not enough).
              </Text>
              <Text as="p">
                Customers will see a floating microphone button and can place
                orders by speaking in <strong>Urdu or Punjabi</strong>.
              </Text>
            </BlockStack>
          </Banner>
        </Layout.Section>

        {stats.totalOrders === 0 && (
          <Layout.Section>
            <Banner title="Waiting for your first voice order" tone="info">
              <Text as="p">
                After enabling the widget, test it on your storefront. New orders
                will appear in the table below.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {/* Stats cards */}
        <Layout.Section>
          <InlineStack gap="400" wrap={false}>
            <StatCard
              label="کل آواز آرڈر"
              sublabel="Total Voice Orders"
              value={stats.totalOrders}
              color="#16a34a"
            />
            <StatCard
              label="تصدیق شدہ"
              sublabel="Confirmed"
              value={stats.confirmedOrders}
              color="#2563eb"
            />
            <StatCard
              label="زیر التواء"
              sublabel="Pending"
              value={stats.pendingOrders}
              color="#d97706"
            />
            <StatCard
              label="کامیابی کی شرح"
              sublabel="Conversion Rate"
              value={`${conversionRate}%`}
              color="#7c3aed"
            />
          </InlineStack>
        </Layout.Section>

        {/* Recent orders table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  حالیہ آواز آرڈر
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Recent Voice Orders
                </Text>
              </InlineStack>
              <Divider />
              {recentOrders.length === 0 ? (
                <EmptyState
                  heading="ابھی تک کوئی آرڈر نہیں"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    No voice orders yet. Enable the widget in your Theme Editor
                    to start receiving orders.
                  </p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "text",
                    "text",
                    "text",
                    "text",
                    "text",
                  ]}
                  headings={[
                    "گاہک",
                    "فون",
                    "آرڈر",
                    "شہر",
                    "حالت",
                    "Shopify #",
                    "تاریخ",
                  ]}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Widget preview info */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Widget Status
                </Text>
                <Divider />
                <InlineStack align="space-between">
                  <Text as="span">Widget</Text>
                  <Badge tone={settings?.enabled ? "success" : "critical"}>
                    {settings?.enabled ? "فعال" : "غیر فعال"}
                  </Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span">Language</Text>
                  <Badge>
                    {settings?.language === "ur"
                      ? "اردو"
                      : settings?.language === "pa"
                        ? "پنجابی"
                        : "اردو + پنجابی"}
                  </Badge>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text as="span">Auto-confirm</Text>
                  <Badge tone={settings?.autoConfirm ? "success" : "new"}>
                    {settings?.autoConfirm ? "On" : "Off"}
                  </Badge>
                </InlineStack>
                <Button onClick={() => navigate("/app/settings")} fullWidth>
                  Configure Widget
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Setup Guide
                </Text>
                <Divider />
                <BlockStack gap="200">
                  <SetupStep
                    number="1"
                    done={true}
                    text="Install Aawaz Order app"
                  />
                  <SetupStep
                    number="2"
                    done={!!settings}
                    text="Configure settings"
                  />
                  <SetupStep
                    number="3"
                    done={stats.totalOrders > 0}
                    text="Enable widget in Theme Editor"
                  />
                  <SetupStep
                    number="4"
                    done={stats.confirmedOrders > 0}
                    text="Receive first voice order"
                  />
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function StatCard({
  label,
  sublabel,
  value,
  color,
}: {
  label: string;
  sublabel: string;
  value: number | string;
  color: string;
}) {
  return (
    <Box
      background="bg-surface"
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
      padding="400"
      minWidth="120px"
    >
      <BlockStack gap="100">
        <Text as="p" variant="headingXl" fontWeight="bold">
          <span style={{ color }}>{value}</span>
        </Text>
        <Text as="p" variant="bodyMd" fontWeight="semibold">
          {label}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {sublabel}
        </Text>
      </BlockStack>
    </Box>
  );
}

function SetupStep({
  number,
  done,
  text,
}: {
  number: string;
  done: boolean;
  text: string;
}) {
  return (
    <InlineStack gap="200" align="start">
      <Box
        background={done ? "bg-fill-success" : "bg-fill-secondary"}
        borderRadius="full"
        minWidth="24px"
        minHeight="24px"
        padding="050"
      >
        <Text as="span" variant="bodySm" tone={done ? "success" : "subdued"}>
          <span style={{ display: "flex", justifyContent: "center" }}>
            {done ? "✓" : number}
          </span>
        </Text>
      </Box>
      <Text
        as="span"
        variant="bodySm"
        tone={done ? "success" : "subdued"}
        textDecorationLine={done ? "line-through" : undefined}
      >
        {text}
      </Text>
    </InlineStack>
  );
}
