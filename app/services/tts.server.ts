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

  const response = await client.audio.speech.create({
    model: "tts-1",
    voice: "nova",   // Clear, friendly voice that handles Urdu well
    input: text,
    response_format: "mp3",
    speed: 0.9,      // Slightly slower for clarity
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
      phone: "فون نمبر",
      full_address: "پتہ",
    };
    const fieldNames = fields.map((f) => fieldMap[f] ?? f).join("، ");
    return `براہ کرم ${fieldNames} بھی بتائیں تاکہ آرڈر مکمل ہو سکے۔`;
  },

  generalError: () =>
    `معذرت، کوئی مسئلہ آ گیا۔ براہ کرم دوبارہ کوشش کریں۔`,

  listening: () => `بول رہے ہیں، آپ اپنا آرڈر بتائیں۔`,
};
