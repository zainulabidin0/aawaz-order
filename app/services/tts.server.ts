import OpenAI from "openai";

let openai: OpenAI;

function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

/**
 * Converts an Urdu text string to speech using OpenAI TTS.
 * Returns the audio as a base64 encoded string (MP3) for the browser to play.
 */
export async function textToSpeechUrdu(text: string): Promise<string> {
  const client = getOpenAI();
  const input = text.trim().slice(0, 400);

  const response = await client.audio.speech.create({
    model: "tts-1",
    voice: "nova",
    input,
    response_format: "mp3",
    speed: 1.05,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString("base64");
}

/**
 * Pre-defined Urdu TTS messages for common responses.
 */
export const UrduMessages = {
  orderPlaced: (productName: string, orderName: string) =>
    `آپ کا آرڈر ${orderName} کامیابی سے ہو گیا۔ ${productName} جلد آپ تک پہنچے گا۔ شکریہ!`,

  orderConfirm: (productName: string, qty: number, unit: string, price: string) =>
    `آپ نے ${qty} ${unit} ${productName} کا آرڈر دیا ہے۔ قیمت ${price} روپے ہے۔ کیا آپ تصدیق کرتے ہیں؟`,

  productNotFound: (query: string) =>
    `معذرت، "${query}" نہیں ملا۔ براہ کرم دوبارہ کوشش کریں یا کوئی اور پروڈکٹ بولیں۔`,

  missingInfo: (fields: string[]) => {
    const fieldMap: Record<string, string> = {
      customer_name: "نام",
      phone: "رابطہ / فون نمبر",
      full_address: "پتہ",
      city: "پتہ",
      area: "پتہ",
      street: "پتہ",
      size: "سائز",
      color: "رنگ",
      Size: "سائز",
      Color: "رنگ",
    };
    const seen = new Set<string>();
    const fieldNames = fields
      .map((f) => fieldMap[f] ?? f)
      .filter((label) => {
        if (seen.has(label)) return false;
        seen.add(label);
        return true;
      })
      .join("، ");
    return `براہ کرم ${fieldNames} بھی بتائیں تاکہ آرڈر مکمل ہو سکے۔`;
  },

  selectVariant: (options: string[]) => {
    const labels = options
      .map((o) => {
        const map: Record<string, string> = {
          size: "سائز",
          color: "رنگ",
          Size: "سائز",
          Color: "رنگ",
        };
        return map[o] ?? o;
      })
      .join(" یا ");
    return `براہ کرم ${labels} منتخب کریں یا آواز میں بتائیں۔`;
  },

  generalError: () =>
    `معذرت، کوئی مسئلہ آ گیا۔ براہ کرم دوبارہ کوشش کریں۔`,

  listening: () => `بول رہے ہیں، آپ اپنا آرڈر بتائیں۔`,
};
