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

const EXTENSION_MIME: Record<string, string> = {
  webm: "audio/webm",
  mp4: "audio/mp4",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
};

/** Detect real container from magic bytes — browsers often mislabel Safari/iOS audio. */
function sniffAudioExtension(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "webm";
  }

  if (buffer.toString("ascii", 0, 4) === "OggS") return "ogg";

  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  ) {
    return "wav";
  }

  if (buffer.toString("ascii", 4, 8) === "ftyp") return "m4a";

  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "mp3";

  return null;
}

function extensionFromMime(mime: string): string | null {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base.includes("webm")) return "webm";
  if (base.includes("mp4") || base.includes("m4a")) return "m4a";
  if (base.includes("mpeg") || base.includes("mp3")) return "mp3";
  if (base.includes("ogg")) return "ogg";
  if (base.includes("wav")) return "wav";
  if (base.includes("flac")) return "flac";
  return null;
}

function extensionFromFilename(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext || ext === filename.toLowerCase()) return null;
  return ext in EXTENSION_MIME ? ext : null;
}

export function resolveWhisperUpload(
  buffer: Buffer,
  filename: string,
  contentType?: string,
): { filename: string; mimeType: string } {
  const ext =
    sniffAudioExtension(buffer) ||
    extensionFromFilename(filename) ||
    extensionFromMime(contentType ?? "") ||
    "webm";

  const mimeType = EXTENSION_MIME[ext] ?? "audio/webm";
  const baseName = filename.includes(".")
    ? filename.replace(/\.[^.]+$/, "")
    : filename || "recording";

  return {
    filename: `${baseName}.${ext}`,
    mimeType,
  };
}

/**
 * Transcribes audio in Urdu or Punjabi using OpenAI Whisper.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string = "audio.webm",
  language: "ur" | "pa" | undefined = "ur",
  contentType?: string,
): Promise<WhisperResult> {
  const client = getOpenAI();
  const resolved = resolveWhisperUpload(audioBuffer, filename, contentType);

  console.log(
    `[whisper] upload ${resolved.filename} (${resolved.mimeType}, ${audioBuffer.length} bytes)`,
  );

  const audioFile = await toFile(audioBuffer, resolved.filename, {
    type: resolved.mimeType,
  });

  const response = await client.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
    language: language ?? "ur",
    response_format: "text",
    prompt:
      "یہ ایک پاکستانی گاہک کا آرڈر ہے۔ گاہک اردو یا پنجابی میں بول رہا ہے۔ آرڈر میں پروڈکٹ کا نام، مقدار، نام، فون نمبر اور پتہ شامل ہو سکتا ہے۔",
  });

  const transcript = typeof response === "string" ? response : "";

  return {
    transcript,
    language: language ?? "ur",
  };
}
