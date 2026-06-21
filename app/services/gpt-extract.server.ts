import OpenAI from "openai";

let openai: OpenAI;

function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export type OrderExtraction = {
  product_query: string;
  product_query_original: string;
  quantity: number;
  unit: string;
  size: string;                  // e.g. "Large", "XL", "42"
  color: string;                 // e.g. "Red", "Blue"
  variant_options: Record<string, string>; // e.g. { "Size": "M", "Color": "Black" }
  customer_name: string;
  phone: string;
  full_address: string;
  city: string;
  area: string;
  street: string;
  missing_fields: string[];
  confidence: number;
  response_urdu: string;
};

const SYSTEM_PROMPT = `You are an order processing assistant for a Pakistani online store.
Customers speak in Urdu, Punjabi, or Roman Urdu (Urdu written in English letters).

Your job is to extract a structured order from the customer's voice transcript and return valid JSON.

RULES:
- product_query: Translate the product name to English for database search. Be specific (e.g. "mango 1kg" not just "mango").
- product_query_original: The product name exactly as the customer said it.
- quantity: Extract the number. Default to 1 if not mentioned.
- unit: Extract unit like "kg", "gram", "piece", "litre", "dozen", "packet". Default "piece".
- size: Clothing/shoe size if mentioned (S, M, L, XL, 32, 42, etc.). Empty string if not mentioned.
- color: Color if mentioned (red, blue, black, safaid, kala, etc.). Empty string if not mentioned.
- variant_options: Object mapping option names to values when customer mentions product variants, e.g. {"Size":"Large","Color":"Red"}. Use English values. Empty object {} if none.
- customer_name: NAME ONLY — full name of the customer. Put here anything the customer says about their name, including:
  Urdu/Punjabi/Roman: "نام", "میرا نام", "mera naam", "naam", "name", "customer name", "اپنا نام", "میں ... ہوں".
  Do NOT put address or phone words in this field.
- phone: CONTACT NUMBER ONLY — Pakistani mobile number. Put here anything about phone/contact, including:
  Urdu/Punjabi/Roman: "فون", "نمبر", "phone", "mobile", "موبائل", "contact", "whatsapp", "واٹس ایپ", "رابطہ", "cell".
  Formats: 03XX-XXXXXXX, 03XXXXXXXXX, +923XXXXXXXXX. Normalize to 03XXXXXXXXX.
  Do NOT put name or address in this field.
- full_address: ADDRESS ONLY — complete delivery address as one readable string. Combine ALL location details here, including:
  Urdu/Punjabi/Roman: "پتہ", "address", "jaga", "جگہ", "makan", "مکان", "ghar", "گھر", "gali", "گلی", "mohalla", "محلہ", "colony", "کالونی", "sector", "سیکٹر", "block", "بلاک", "area", "ilaka", "علاقہ", "shehar", "شہر", "city".
  Also fill city, area, street as sub-fields when mentioned, but full_address must always contain the full combined address.
- city: City name in English (e.g. "Lahore", "Karachi", "Islamabad"). Part of address — also include in full_address.
- area: Neighborhood/colony/mohalla/sector. Part of address — also include in full_address.
- street: Street, house number, flat number. Part of address — also include in full_address.
- missing_fields: Use ONLY these keys: "customer_name", "phone", "full_address", "size", "color".
  If customer gave name but not phone, use ["phone"]. If they gave city/area but you can build full_address, do NOT mark full_address missing.
- confidence: Your confidence (0.0-1.0) that you correctly understood the order.
- response_urdu: A short Urdu sentence summarizing what you understood, to read back to the customer for confirmation.

EXAMPLES of Roman Urdu that maps to products:
- "aam" = mango, "seb" = apple, "chawal" = rice, "doodh" = milk, "atta" = flour,
  "dahi" = yogurt, "gosht" = meat, "murgh" = chicken, "machli" = fish,
  "sabzi" = vegetables, "pyaz" = onion, "tamatar" = tomato, "aloo" = potato.

Always return a valid JSON object matching the schema exactly.`;

export async function extractOrderDetails(
  transcript: string
): Promise<OrderExtraction> {
  const client = getOpenAI();

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Extract order details from this transcript:\n\n"${transcript}"\n\nReturn only valid JSON.`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const raw = response.choices[0].message.content ?? "{}";

  try {
    const parsed = JSON.parse(raw) as Partial<OrderExtraction>;

    // Apply safe defaults and normalize into name / phone / address sections
    return normalizeExtraction({
      product_query: parsed.product_query ?? "",
      product_query_original: parsed.product_query_original ?? parsed.product_query ?? "",
      quantity: Number(parsed.quantity) || 1,
      unit: parsed.unit ?? "piece",
      size: parsed.size ?? "",
      color: parsed.color ?? "",
      variant_options:
        parsed.variant_options && typeof parsed.variant_options === "object"
          ? (parsed.variant_options as Record<string, string>)
          : {},
      customer_name: parsed.customer_name ?? "",
      phone: normalizePhone(parsed.phone ?? ""),
      full_address: parsed.full_address ?? "",
      city: parsed.city ?? "",
      area: parsed.area ?? "",
      street: parsed.street ?? "",
      missing_fields: Array.isArray(parsed.missing_fields)
        ? parsed.missing_fields
        : [],
      confidence: Number(parsed.confidence) || 0.5,
      response_urdu:
        parsed.response_urdu ??
        "آپ کا آرڈر موصول ہو گیا، براہ کرم تصدیق کریں۔",
    });
  } catch {
    throw new Error(`Failed to parse GPT-4o response: ${raw}`);
  }
}

/** Single display string for the address section. */
export function formatAddressDisplay(
  extraction: Pick<OrderExtraction, "street" | "area" | "city" | "full_address">,
): string {
  const parts = [extraction.street, extraction.area, extraction.city, extraction.full_address]
    .map((p) => p?.trim())
    .filter(Boolean);
  return [...new Set(parts)].join(", ");
}

/** Merge name, phone, and address terms into their correct sections. */
export function normalizeExtraction(
  extraction: OrderExtraction,
): OrderExtraction {
  const customer_name = extraction.customer_name.trim();
  const phone = extraction.phone.trim();
  const full_address = formatAddressDisplay(extraction);

  const missing_fields = extraction.missing_fields.filter((f) => {
    if (f === "customer_name") return !customer_name;
    if (f === "phone") return !phone;
    if (f === "full_address") return !full_address;
    return true;
  });

  return {
    ...extraction,
    customer_name,
    phone,
    full_address,
    missing_fields,
  };
}

/**
 * Builds a natural Urdu confirmation message for TTS playback.
 */
export function buildConfirmationUrdu(
  extraction: OrderExtraction,
  productTitle: string,
  price: string,
  variantLabel?: string,
): string {
  const qty =
    extraction.quantity > 1
      ? `${extraction.quantity} ${extraction.unit}`
      : `ایک ${extraction.unit}`;
  const variantPart = variantLabel ? ` (${variantLabel})` : "";
  return `آپ نے ${qty} ${productTitle}${variantPart} کا آرڈر دیا ہے۔ قیمت ${price} روپے ہے۔ پتہ: ${formatAddressDisplay(extraction)}۔ کیا آپ تصدیق کرتے ہیں؟`;
}

/**
 * Builds a Pakistani address string for the Shopify order.
 */
export function buildShopifyAddress(extraction: OrderExtraction) {
  const display = formatAddressDisplay(extraction);
  const streetLine =
    [extraction.street, extraction.area].filter(Boolean).join(", ") || display;

  return {
    firstName: extraction.customer_name.split(" ")[0] || extraction.customer_name,
    lastName: extraction.customer_name.split(" ").slice(1).join(" ") || ".",
    phone: extraction.phone,
    address1: streetLine,
    city: extraction.city || "Unknown",
    country: "Pakistan",
    countryCode: "PK",
  };
}

function normalizePhone(phone: string): string {
  // Strip spaces, dashes, parentheses
  const digits = phone.replace(/[\s\-\(\)\.]/g, "");
  // Convert +92XXXXXXXXXX → 0XXXXXXXXXX
  if (digits.startsWith("+92")) return "0" + digits.slice(3);
  // Convert 92XXXXXXXXXX → 0XXXXXXXXXX
  if (digits.startsWith("92") && digits.length === 12) return "0" + digits.slice(2);
  return digits;
}
