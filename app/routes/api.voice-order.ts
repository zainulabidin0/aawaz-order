/**
 * POST /api/voice-order
 *
 * Public endpoint called from the storefront Theme App Extension widget.
 * Orchestrates the full pipeline:
 *   audio → Whisper STT → GPT-4o extract → Shopify product search
 *   → create Shopify order → TTS confirmation audio
 *
 * POST /api/voice-order?action=confirm
 * Confirms a pending voice order (creates the real Shopify order).
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import {
  json,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import db from "../db.server";
import {
  getOfflineAdmin,
  isShopifyUnauthorized,
  ShopifyConnectionError,
} from "../services/shopify-admin.server";
import { transcribeAudio } from "../services/whisper.server";
import {
  extractOrderDetails,
  buildConfirmationUrdu,
  buildShopifyAddress,
  type OrderExtraction,
} from "../services/gpt-extract.server";
import {
  searchProducts,
  getProductById,
  matchVariant,
  productNeedsVariantChoice,
  getSelectableVariants,
  getMissingVariantOptionNames,
  applyVariantToProduct,
  type ShopifyProduct,
} from "../services/shopify-products.server";
import { createShopifyOrder } from "../services/shopify-orders.server";
import { textToSpeechUrdu, UrduMessages } from "../services/tts.server";

// CORS headers — allow requests from any Shopify storefront domain
function corsHeaders(origin: string) {
  const isShopify =
    origin.endsWith(".myshopify.com") ||
    origin.endsWith(".shopify.com") ||
    origin === "";

  return {
    "Access-Control-Allow-Origin": isShopify ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// Handle CORS preflight and health checks (must stay fast — no OpenAI calls).
export async function loader({ request }: ActionFunctionArgs) {
  const origin = request.headers.get("Origin") ?? "";
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  return json({ ok: true }, { headers });
}

export async function action({ request }: ActionFunctionArgs) {
  const origin = request.headers.get("Origin") ?? "";
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const startedAt = Date.now();
  const logStep = (step: string) =>
    console.log(`[voice-order] ${step} +${Date.now() - startedAt}ms`);

  try {
    const url = new URL(request.url);
    const actionType = url.searchParams.get("action");

    // ── Confirm flow: customer tapped "Confirm Order" ──────────────────────
    if (actionType === "confirm") {
      return handleConfirm(request, headers);
    }

    if (actionType === "select_variant") {
      return handleSelectVariant(request, headers);
    }

    // ── Voice capture flow ─────────────────────────────────────────────────
    const uploadHandler = unstable_createMemoryUploadHandler({
      maxPartSize: 15_000_000, // 15 MB max audio
    });

    const formData = await unstable_parseMultipartFormData(
      request,
      uploadHandler
    );

    const shop = formData.get("shop") as string;
    const language = (formData.get("language") as "ur" | "pa") ?? "ur";
    const audioFile = formData.get("audio") as File | null;
    const mimeTypeField = formData.get("mime_type") as string | null;
    const continueOrderId = formData.get("voiceOrderId") as string | null;

    if (!shop) {
      return json({ error: "Missing shop domain" }, { status: 400, headers });
    }
    if (!audioFile) {
      return json({ error: "Missing audio file" }, { status: 400, headers });
    }

    if (audioFile.size < 1000) {
      return json(
        { error: "Audio recording too short. Please speak clearly and try again." },
        { status: 422, headers },
      );
    }

    const { admin } = await getOfflineAdmin(shop);
    logStep("shopify session loaded");

    // Load app settings for this shop
    const settings = await db.appSettings.findUnique({ where: { shop } });
    if (settings && !settings.enabled) {
      return json({ error: "Widget is disabled" }, { status: 403, headers });
    }

    // ── Step 1: Transcribe audio with Whisper ──────────────────────────────
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const { transcript: initialTranscript } = await transcribeAudio(
      audioBuffer,
      audioFile.name || "recording.webm",
      language,
      mimeTypeField || audioFile.type || undefined,
    );
    let transcript = initialTranscript;
    logStep("whisper done");

    if (!transcript.trim()) {
      const audio = await textToSpeechUrdu(UrduMessages.generalError());
      return json(
        { error: "Could not transcribe audio", transcript: "", audio },
        { status: 422, headers }
      );
    }

    // ── Step 2: Extract order details with GPT-4o ──────────────────────────
    let extraction: OrderExtraction;
    let priorOrder: Awaited<ReturnType<typeof db.voiceOrder.findUnique>> = null;

    if (continueOrderId) {
      priorOrder = await db.voiceOrder.findUnique({
        where: { id: continueOrderId },
      });
      if (!priorOrder || priorOrder.shop !== shop) {
        return json({ error: "Order session not found" }, { status: 404, headers });
      }
      const combined = `${priorOrder.transcript} ${initialTranscript}`.trim();
      extraction = mergeExtraction(
        priorOrder,
        await extractOrderDetails(combined),
      );
      transcript = combined;
    } else {
      extraction = await extractOrderDetails(transcript);
    }
    logStep("gpt extract done");

    // ── Step 3: Resolve product (reuse prior product on continuation) ─────
    let product: ShopifyProduct | null = null;
    if (priorOrder?.productId) {
      product = await getProductById(admin, priorOrder.productId);
    }
    if (!product) {
      const products = await searchProducts(admin, extraction.product_query, 5);
      product = products.find((p) => p.availableForSale) ?? products[0] ?? null;
    }
    logStep("product search done");

    if (!product) {
      const audio = await textToSpeechUrdu(
        UrduMessages.productNotFound(extraction.product_query_original)
      );
      logStep("product not found response ready");
      return json(
        {
          stage: "product_not_found",
          transcript,
          extraction,
          audio,
        },
        { status: 200, headers }
      );
    }

  return processMatchedProduct({
    shop,
    transcript,
    extraction,
    product,
    settings,
    admin,
    headers,
    priorOrderId: priorOrder?.id ?? null,
    logStep,
  });
  } catch (err) {
    console.error("[voice-order] Error:", err);

    if (err instanceof ShopifyConnectionError || isShopifyUnauthorized(err)) {
      const reconnectUrdu =
        "اسٹور سے رابطہ نہیں ہے۔ دکاندار کو Shopify ایڈمن میں Aawaz Order ایپ کھولنی ہوگی۔";
      const audio = await textToSpeechUrdu(reconnectUrdu).catch(() => "");
      return json(
        {
          stage: "error",
          code: "shop_reconnect_required",
          error: reconnectUrdu,
          audio,
        },
        { status: 503, headers },
      );
    }

    const message =
      err instanceof Error
        ? err.message.includes("Invalid file format") ||
          err.message.includes("corrupted or unsupported")
          ? "آڈیو فارمیٹ کی خرابی۔ دوبارہ کوشش کریں۔"
          : err.message.includes("variant")
            ? "پروڈکٹ کا سائز یا رنگ منتخب کریں۔"
            : err.message
        : "Internal server error";
    const audio = await textToSpeechUrdu(UrduMessages.generalError()).catch(
      () => "",
    );
    return json({ error: message, audio }, { status: 500, headers });
  }
}

// ── Confirm handler ──────────────────────────────────────────────────────────

async function handleConfirm(
  request: Request,
  headers: Record<string, string>
) {
  try {
    return await handleConfirmInner(request, headers);
  } catch (err) {
    console.error("[voice-order] confirm error:", err);
    const message =
      err instanceof Error ? err.message : "Could not create Shopify order";
    const audio = await textToSpeechUrdu(UrduMessages.generalError()).catch(
      () => "",
    );
    return json({ stage: "error", error: message, audio }, { status: 500, headers });
  }
}

async function handleConfirmInner(
  request: Request,
  headers: Record<string, string>
) {
  const body = await request.json() as { voiceOrderId: string; shop: string };
  const { voiceOrderId, shop } = body;

  if (!voiceOrderId || !shop) {
    return json({ error: "Missing voiceOrderId or shop" }, { status: 400, headers });
  }

  const voiceOrder = await db.voiceOrder.findUnique({
    where: { id: voiceOrderId },
  });

  if (!voiceOrder || voiceOrder.shop !== shop) {
    return json({ error: "Voice order not found" }, { status: 404, headers });
  }
  if (voiceOrder.status !== "pending") {
    return json({ error: "Order already processed" }, { status: 409, headers });
  }
  if (!voiceOrder.variantId) {
    return json(
      { error: "Product variant not selected. Please try again." },
      { status: 422, headers },
    );
  }

  const { admin } = await getOfflineAdmin(shop);

  const extraction = {
    customer_name: voiceOrder.customerName,
    phone: voiceOrder.phone,
    full_address: voiceOrder.fullAddress,
    city: voiceOrder.city ?? "",
    area: voiceOrder.area ?? "",
    street: "",
    quantity: voiceOrder.quantity,
    unit: voiceOrder.unit ?? "piece",
    product_query: voiceOrder.productQuery,
    product_query_original: voiceOrder.productQuery,
    missing_fields: [] as string[],
    confidence: 1,
    response_urdu: "",
  };

  const product = {
    id: voiceOrder.productId ?? "",
    title: voiceOrder.productTitle ?? "",
    handle: "",
    status: "ACTIVE",
    productType: "",
    imageUrl: null,
    variantId: voiceOrder.variantId ?? "",
    variantTitle: voiceOrder.variantTitle ?? "",
    price: voiceOrder.price ?? "0.00",
    availableForSale: true,
    options: [],
    variants: [],
  };

  const result = await createOrderForVoiceOrder(
    admin,
    voiceOrder.id,
    extraction,
    {
      variantId: product.variantId,
      title: product.title,
      price: product.price,
      variantTitle: voiceOrder.variantTitle ?? undefined,
    },
  );

  const audio = await textToSpeechUrdu(
    UrduMessages.orderPlaced(product.title, result.orderName)
  );

  return json(
    { stage: "order_placed", order: result, audio },
    { status: 200, headers }
  );
}

// ── Variant selection (tap size/color in widget) ───────────────────────────

async function handleSelectVariant(
  request: Request,
  headers: Record<string, string>,
) {
  const body = (await request.json()) as {
    shop: string;
    variantId: string;
    productId: string;
    extraction: OrderExtraction;
    transcript: string;
    voiceOrderId?: string;
  };

  const { shop, variantId, productId, extraction, transcript, voiceOrderId } =
    body;

  if (!shop || !variantId || !productId || !extraction) {
    return json({ error: "Missing required fields" }, { status: 400, headers });
  }

  const { admin } = await getOfflineAdmin(shop);
  const product = await getProductById(admin, productId);
  if (!product) {
    return json({ error: "Product not found" }, { status: 404, headers });
  }

  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) {
    return json({ error: "Variant not found" }, { status: 404, headers });
  }

  const productWithVariant = applyVariantToProduct(product, variant);
  const settings = await db.appSettings.findUnique({ where: { shop } });

  return processMatchedProduct({
    shop,
    transcript,
    extraction,
    product: productWithVariant,
    settings,
    admin,
    headers,
    priorOrderId: voiceOrderId ?? null,
    logStep: (step) => console.log(`[voice-order] select_variant ${step}`),
    skipVariantCheck: true,
  });
}

// ── Shared product → confirm / missing / variant flow ───────────────────────

function mergeExtraction(
  prior: {
    customerName: string;
    phone: string;
    fullAddress: string;
    city: string | null;
    area: string | null;
    productQuery: string;
    quantity: number;
    unit: string | null;
  },
  fresh: OrderExtraction,
): OrderExtraction {
  return {
    ...fresh,
    customer_name: fresh.customer_name || prior.customerName,
    phone: fresh.phone || prior.phone,
    full_address: fresh.full_address || prior.fullAddress,
    city: fresh.city || prior.city || "",
    area: fresh.area || prior.area || "",
    product_query: fresh.product_query || prior.productQuery,
    quantity: fresh.quantity || prior.quantity,
    unit: fresh.unit || prior.unit || "piece",
    missing_fields: fresh.missing_fields.filter((f) => {
      const val = fresh[f as keyof OrderExtraction];
      return !val || (typeof val === "string" && !val.trim());
    }),
  };
}

async function processMatchedProduct({
  shop,
  transcript,
  extraction,
  product,
  settings,
  admin,
  headers,
  priorOrderId,
  logStep,
  skipVariantCheck = false,
}: {
  shop: string;
  transcript: string;
  extraction: OrderExtraction;
  product: ShopifyProduct;
  settings: Awaited<ReturnType<typeof db.appSettings.findUnique>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  headers: Record<string, string>;
  priorOrderId: string | null;
  logStep: (step: string) => void;
  skipVariantCheck?: boolean;
}) {
  if (!skipVariantCheck && productNeedsVariantChoice(product)) {
    const matched = matchVariant(product, extraction);
    const missingOptions = getMissingVariantOptionNames(product, matched);

    if (missingOptions.length > 0) {
      const audio = await textToSpeechUrdu(
        UrduMessages.selectVariant(missingOptions),
      );
      return json(
        {
          stage: "select_variant",
          transcript,
          extraction,
          product,
          variants: getSelectableVariants(product),
          missing_options: missingOptions,
          audio,
        },
        { status: 200, headers },
      );
    }

    if (matched) {
      product = applyVariantToProduct(product, matched);
    }
  }

  const requiredFields = ["customer_name", "phone", "full_address"];
  const missing = requiredFields.filter(
    (f) =>
      extraction.missing_fields.includes(f) ||
      !extraction[f as keyof OrderExtraction],
  );

  if (missing.length > 0) {
    let partial;
    if (priorOrderId) {
      partial = await db.voiceOrder.update({
        where: { id: priorOrderId },
        data: {
          transcript,
          productId: product.id,
          productTitle: product.title,
          variantId: product.variantId || null,
          variantTitle: product.variantTitle || null,
          price: product.price,
          quantity: extraction.quantity,
          unit: extraction.unit,
          customerName: extraction.customer_name || "—",
          phone: extraction.phone || "—",
          fullAddress: extraction.full_address || "—",
          city: extraction.city,
          area: extraction.area,
          missingFields: JSON.stringify(missing),
        },
      });
    } else {
      partial = await db.voiceOrder.create({
        data: {
          shop,
          transcript,
          productQuery: extraction.product_query,
          productId: product.id,
          productTitle: product.title,
          variantId: product.variantId || null,
          variantTitle: product.variantTitle || null,
          price: product.price,
          quantity: extraction.quantity,
          unit: extraction.unit,
          customerName: extraction.customer_name || "—",
          phone: extraction.phone || "—",
          fullAddress: extraction.full_address || "—",
          city: extraction.city,
          area: extraction.area,
          status: "pending",
          missingFields: JSON.stringify(missing),
        },
      });
    }

    const audio = await textToSpeechUrdu(UrduMessages.missingInfo(missing));
    return json(
      {
        stage: "missing_info",
        voiceOrderId: partial.id,
        transcript,
        extraction,
        product,
        missing_fields: missing,
        audio,
      },
      { status: 200, headers },
    );
  }

  if (!product.variantId) {
    const audio = await textToSpeechUrdu(
      UrduMessages.selectVariant(
        getMissingVariantOptionNames(product, null).length
          ? getMissingVariantOptionNames(product, null)
          : ["size", "color"],
      ),
    );
    return json(
      {
        stage: "select_variant",
        transcript,
        extraction,
        product,
        variants: getSelectableVariants(product),
        missing_options: getMissingVariantOptionNames(product, null),
        audio,
      },
      { status: 200, headers },
    );
  }

  const price = `Rs. ${parseFloat(product.price).toFixed(0)}`;
  const confirmationText = buildConfirmationUrdu(
    extraction,
    product.title,
    price,
    product.variantTitle && product.variantTitle !== "Default Title"
      ? product.variantTitle
      : undefined,
  );

  let voiceOrder;
  if (priorOrderId) {
    voiceOrder = await db.voiceOrder.update({
      where: { id: priorOrderId },
      data: {
        transcript,
        productQuery: extraction.product_query,
        productId: product.id,
        productTitle: product.title,
        variantId: product.variantId,
        variantTitle: product.variantTitle || null,
        price: product.price,
        quantity: extraction.quantity,
        unit: extraction.unit,
        customerName: extraction.customer_name,
        phone: extraction.phone,
        fullAddress: extraction.full_address,
        city: extraction.city,
        area: extraction.area,
        status: "pending",
        missingFields: JSON.stringify([]),
      },
    });
  } else {
    voiceOrder = await db.voiceOrder.create({
      data: {
        shop,
        transcript,
        productQuery: extraction.product_query,
        productId: product.id,
        productTitle: product.title,
        variantId: product.variantId,
        variantTitle: product.variantTitle || null,
        price: product.price,
        quantity: extraction.quantity,
        unit: extraction.unit,
        customerName: extraction.customer_name,
        phone: extraction.phone,
        fullAddress: extraction.full_address,
        city: extraction.city,
        area: extraction.area,
        status: "pending",
        missingFields: JSON.stringify([]),
      },
    });
  }

  const audio = await textToSpeechUrdu(
    extraction.response_urdu || confirmationText,
  );
  logStep("tts done");

  if (settings?.autoConfirm) {
    if (!product.variantId) {
      const audio = await textToSpeechUrdu(UrduMessages.selectVariant(["size", "color"]));
      return json(
        {
          stage: "select_variant",
          voiceOrderId: voiceOrder.id,
          transcript,
          extraction,
          product,
          variants: getSelectableVariants(product),
          missing_options: getMissingVariantOptionNames(product, null),
          audio,
        },
        { status: 200, headers },
      );
    }

    const result = await createOrderForVoiceOrder(
      admin,
      voiceOrder.id,
      extraction,
      product,
    );
    const successAudio = await textToSpeechUrdu(
      UrduMessages.orderPlaced(product.title, result.orderName),
    );
    return json(
      {
        stage: "order_placed",
        voiceOrderId: voiceOrder.id,
        transcript,
        extraction,
        product,
        order: result,
        audio: successAudio,
      },
      { status: 200, headers },
    );
  }

  logStep("confirm response ready");
  return json(
    {
      stage: "confirm",
      voiceOrderId: voiceOrder.id,
      transcript,
      extraction,
      product,
      confirmationText,
      audio,
    },
    { status: 200, headers },
  );
}

// ── Shared: create Shopify order and update DB record ───────────────────────

type ExtractionLike = {
  customer_name: string;
  phone: string;
  full_address: string;
  city: string;
  area: string;
  street: string;
  quantity: number;
  unit: string;
  product_query: string;
  product_query_original: string;
  missing_fields: string[];
  confidence: number;
  response_urdu: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createOrderForVoiceOrder(
  admin: any,
  voiceOrderId: string,
  extraction: ExtractionLike,
  product: {
    variantId: string;
    title: string;
    price: string;
    variantTitle?: string;
  },
) {
  const address = buildShopifyAddress(extraction);
  const variantNote = product.variantTitle
    ? `\nVariant: ${product.variantTitle}`
    : "";
  const note = `آواز آرڈر | Aawaz Order\nPhone: ${extraction.phone}\nAddress: ${extraction.full_address}${variantNote}`;

  const order = await createShopifyOrder(admin, {
    variantId: product.variantId,
    quantity: extraction.quantity,
    customerName: extraction.customer_name,
    phone: extraction.phone,
    address1: address.address1 || extraction.full_address,
    city: address.city,
    country: "Pakistan",
    countryCode: "PK",
    note,
  });

  await db.voiceOrder.update({
    where: { id: voiceOrderId },
    data: {
      shopifyOrderId: order.orderId,
      shopifyOrderName: order.orderName,
      status: "confirmed",
    },
  });

  return { orderId: order.orderId, orderName: order.orderName };
}
