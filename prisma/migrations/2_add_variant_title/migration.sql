-- Add variant title for voice orders (size/color label)
ALTER TABLE "VoiceOrder" ADD COLUMN IF NOT EXISTS "variantTitle" TEXT;
