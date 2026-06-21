import OpenAI from "openai";
import { toFile } from "openai";

let openai: OpenAI;

function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export type WhisperResult = {
  transcript: string;
  language: string;
  duration?: number;
};

/**
 * Transcribes audio in Urdu or Punjabi using OpenAI Whisper.
 * Accepts a Buffer (from multipart form upload) and the original filename.
 * Returns the Urdu transcript text.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string = "audio.webm",
  language: "ur" | "pa" | undefined = "ur"
): Promise<WhisperResult> {
  const client = getOpenAI();

  // Convert Buffer to File object that OpenAI SDK accepts
  const audioFile = await toFile(audioBuffer, filename, {
    type: getMimeType(filename),
  });

  const response = await client.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
    language: language ?? "ur",
    response_format: "verbose_json",
    // Prompt helps guide Whisper to expect Urdu/Pakistani context
    prompt:
      "یہ ایک پاکستانی گاہک کا آرڈر ہے۔ گاہک اردو یا پنجابی میں بول رہا ہے۔ آرڈر میں پروڈکٹ کا نام، مقدار، نام، فون نمبر اور پتہ شامل ہو سکتا ہے۔",
  });

  return {
    transcript: response.text,
    language: response.language ?? language ?? "ur",
    duration: response.duration,
  };
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    webm: "audio/webm",
    mp4: "audio/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
  };
  return types[ext ?? ""] ?? "audio/webm";
}
