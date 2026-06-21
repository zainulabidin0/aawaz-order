import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  Select,
  TextField,
  Checkbox,
  Button,
  Banner,
  Text,
  BlockStack,
  Divider,
  InlineStack,
  Box,
  Badge,
  CalloutCard,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { themeAppEmbedUrl } from "../utils/theme-embed.server";
import {
  verifyAdminConnection,
  verifyStorefrontConnection,
  healShopSessions,
} from "../services/shopify-admin.server";

const LANGUAGE_OPTIONS = [
  { label: "اردو — Urdu", value: "ur" },
  { label: "پنجابی — Punjabi", value: "pa" },
  { label: "اردو + پنجابی — Both", value: "both" },
];

const COLOR_PRESETS = [
  { label: "Green (Default)", value: "#16a34a" },
  { label: "Blue", value: "#2563eb" },
  { label: "Purple", value: "#7c3aed" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Custom", value: "custom" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  await healShopSessions(shop);

  const settings = await db.appSettings.findUnique({ where: { shop } });
  const adminConnection = await verifyAdminConnection(admin);
  const storefrontConnection = await verifyStorefrontConnection(shop);

  return json({
    shop,
    connection: adminConnection,
    storefrontConnection,
    appUrl: process.env.SHOPIFY_APP_URL ?? "",
    themeEmbedUrl: themeAppEmbedUrl(
      shop,
      process.env.SHOPIFY_API_KEY ?? "",
    ),
    settings: settings ?? {
      language: "ur",
      widgetColor: "#16a34a",
      autoConfirm: false,
      enabled: true,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const language = formData.get("language") as string;
  const widgetColor = formData.get("widgetColor") as string;
  const autoConfirm = formData.get("autoConfirm") === "true";
  const enabled = formData.get("enabled") === "true";

  await db.appSettings.upsert({
    where: { shop },
    update: { language, widgetColor, autoConfirm, enabled },
    create: { shop, language, widgetColor, autoConfirm, enabled },
  });

  return json({ success: true, saved: new Date().toISOString() });
}

export default function Settings() {
  const { settings, appUrl, shop, themeEmbedUrl, connection, storefrontConnection } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [language, setLanguage] = useState(settings.language);
  const [widgetColor, setWidgetColor] = useState(settings.widgetColor);
  const [autoConfirm, setAutoConfirm] = useState(settings.autoConfirm);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [colorMode, setColorMode] = useState<string>(
    COLOR_PRESETS.find((c) => c.value === settings.widgetColor)?.value ??
      "custom"
  );

  const handleColorPreset = useCallback(
    (value: string) => {
      setColorMode(value);
      if (value !== "custom") setWidgetColor(value);
    },
    []
  );

  const handleSave = useCallback(() => {
    const data = new FormData();
    data.append("language", language);
    data.append("widgetColor", widgetColor);
    data.append("autoConfirm", String(autoConfirm));
    data.append("enabled", String(enabled));
    submit(data, { method: "post" });
  }, [language, widgetColor, autoConfirm, enabled, submit]);

  return (
    <Page
      title="Aawaz Order Settings"
      subtitle="ویجٹ کی ترتیبات — Widget Configuration"
      primaryAction={{
        content: isSaving ? "Saving..." : "Save Settings",
        onAction: handleSave,
        loading: isSaving,
      }}
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" title="Settings saved successfully!">
              <Text as="p">
                Your widget settings have been updated. Changes take effect
                immediately.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {!connection.ok && (
          <Layout.Section>
            <Banner tone="critical" title="App connection issue">
              <Text as="p">
                Could not verify your Shopify admin session. Reload this page
                from Shopify Admin.
              </Text>
              {connection.error && (
                <Text as="p" tone="subdued">
                  {connection.error}
                </Text>
              )}
            </Banner>
          </Layout.Section>
        )}

        {connection.ok && !storefrontConnection.ok && (
          <Layout.Section>
            <Banner tone="warning" title="Storefront voice orders need reconnect">
              <Text as="p">
                The admin app is connected, but the stored token for customer
                voice orders is invalid (common after reinstall). Click below,
                then reload this page.
              </Text>
              {storefrontConnection.error && (
                <Text as="p" tone="subdued">
                  {storefrontConnection.error}
                </Text>
              )}
              <Box paddingBlockStart="200">
                <Button url={`/auth/login?shop=${shop}`} external>
                  Reconnect store
                </Button>
              </Box>
            </Banner>
          </Layout.Section>
        )}

        {connection.ok && storefrontConnection.ok && (
          <Layout.Section>
            <Banner tone="success" title="Store connected">
              <Text as="p">
                Voice orders are ready
                {storefrontConnection.shopName
                  ? ` for ${storefrontConnection.shopName}`
                  : ""}
                .
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {/* Widget toggle */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Widget Status
                  </Text>
                  <Text as="p" tone="subdued">
                    Enable or disable the voice ordering widget on your store
                  </Text>
                </BlockStack>
                <Badge tone={enabled ? "success" : "critical"}>
                  {enabled ? "فعال / Active" : "غیر فعال / Inactive"}
                </Badge>
              </InlineStack>
              <Divider />
              <Checkbox
                label="Enable Aawaz Order voice widget on storefront"
                helpText="When enabled, a floating microphone button appears on your store for customers to place voice orders."
                checked={enabled}
                onChange={setEnabled}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Layout>
            {/* Language & Behaviour */}
            <Layout.Section variant="oneHalf">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    زبان اور طرز عمل
                  </Text>
                  <Text as="p" tone="subdued">
                    Language & Behaviour
                  </Text>
                  <Divider />
                  <FormLayout>
                    <Select
                      label="Voice Language / آواز کی زبان"
                      options={LANGUAGE_OPTIONS}
                      value={language}
                      onChange={setLanguage}
                      helpText="Whisper will be set to this language for transcription. 'Both' tries Urdu first."
                    />
                    <Checkbox
                      label="Auto-confirm orders (خودکار تصدیق)"
                      helpText="When enabled, orders are confirmed immediately after voice capture without a manual confirmation step. Recommended for COD stores with high trust."
                      checked={autoConfirm}
                      onChange={setAutoConfirm}
                    />
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Widget appearance */}
            <Layout.Section variant="oneHalf">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    ویجٹ رنگ
                  </Text>
                  <Text as="p" tone="subdued">
                    Widget Colour
                  </Text>
                  <Divider />
                  <FormLayout>
                    <Select
                      label="Color Preset"
                      options={COLOR_PRESETS}
                      value={colorMode}
                      onChange={handleColorPreset}
                    />
                    {colorMode === "custom" && (
                      <TextField
                        label="Custom Color (hex)"
                        value={widgetColor}
                        onChange={setWidgetColor}
                        placeholder="#16a34a"
                        autoComplete="off"
                        helpText="Enter a hex color code, e.g. #16a34a"
                      />
                    )}

                    {/* Live color preview */}
                    <Box
                      borderRadius="200"
                      padding="400"
                      background="bg-surface-secondary"
                    >
                      <InlineStack align="center" gap="300">
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: "50%",
                            background: widgetColor,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ fontSize: 24 }}>🎤</span>
                        </div>
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            آواز آرڈر
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Widget preview
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    </Box>
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </Layout.Section>

        {/* Theme editor instructions */}
        <Layout.Section>
          <CalloutCard
            title="Enable widget in Theme Editor"
            illustration="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            primaryAction={{
              content: "Open App embeds",
              url: themeEmbedUrl,
              external: true,
            }}
          >
            <BlockStack gap="200">
              <Text as="p">
                After saving settings, activate the widget in your Shopify Theme
                Editor. If <strong>Aawaz Order Widget</strong> is not listed under
                App embeds, run <code>shopify app deploy</code> from the project
                folder first.
              </Text>
              <ol style={{ paddingLeft: 20 }}>
                <li>Open Theme Editor → click App embeds (left sidebar)</li>
                <li>Find <strong>Aawaz Order Widget</strong> and toggle it ON</li>
                <li>Click Save — the mic button appears on your store instantly</li>
              </ol>
            </BlockStack>
          </CalloutCard>
        </Layout.Section>

        {/* API URL for extension */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Developer Info
              </Text>
              <Divider />
              <FormLayout>
                <TextField
                  label="App API URL (read-only)"
                  value={appUrl ? `${appUrl}/api/voice-order` : "Set SHOPIFY_APP_URL in .env"}
                  autoComplete="off"
                  readOnly
                  helpText="This URL is automatically injected into the Theme App Extension. No action needed."
                />
                <TextField
                  label="Shop Domain"
                  value={shop}
                  autoComplete="off"
                  readOnly
                />
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
