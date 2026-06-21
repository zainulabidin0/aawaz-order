# آواز آرڈر — Aawaz Order

**Voice-powered ordering for Pakistani Shopify stores.**  
Let customers place orders by speaking in Urdu or Punjabi — no English or typing required.

---

## How It Works

1. A floating microphone button appears on every page of the Shopify store
2. Customer taps the button and speaks:
   > *"مجھے ۲ کلو آم چاہیے، میرا نام احمد ہے، لاہور گلبرگ میں رہتا ہوں، نمبر ۰۳۰۰۱۲۳۴۵۶۷"*
3. OpenAI Whisper transcribes the voice in Urdu/Punjabi
4. GPT-4o extracts: product, quantity, customer name, phone, address
5. Shopify product catalog is searched automatically
6. A confirmation card shows the order details in Urdu
7. Customer taps Confirm — a COD (cash on delivery) draft order is created in Shopify
8. An Urdu voice reply confirms the order placement

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shopify App | Remix + Shopify CLI 3 |
| UI | Shopify Polaris |
| Speech-to-Text | OpenAI Whisper (`whisper-1`) |
| Order Extraction | OpenAI GPT-4o |
| Text-to-Speech | OpenAI TTS (`tts-1`, voice: nova) |
| Database | Prisma + SQLite (dev) / PostgreSQL (prod) |
| Storefront Widget | Theme App Extension (Liquid + Vanilla JS) |

---

## Project Structure

```
uni-pro/
├── app/
│   ├── shopify.server.ts         # Shopify OAuth & session
│   ├── db.server.ts              # Prisma client singleton
│   ├── root.tsx                  # Remix root
│   ├── routes/
│   │   ├── app.tsx               # Admin layout (Polaris + App Bridge)
│   │   ├── app._index.tsx        # Merchant dashboard
│   │   ├── app.settings.tsx      # Widget settings
│   │   ├── api.voice-order.ts    # Core API endpoint
│   │   ├── auth.$.tsx            # Shopify OAuth handler
│   │   └── webhooks.tsx          # GDPR webhooks
│   └── services/
│       ├── whisper.server.ts     # STT via OpenAI Whisper
│       ├── gpt-extract.server.ts # Order extraction via GPT-4o
│       ├── shopify-products.server.ts
│       ├── shopify-orders.server.ts
│       └── tts.server.ts         # Urdu TTS via OpenAI
├── extensions/
│   └── voice-order-widget/       # Theme App Extension
│       ├── blocks/voice_button.liquid
│       └── assets/
│           ├── voice-widget.js
│           └── voice-widget.css
└── prisma/
    └── schema.prisma
```

---

## Local Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18.20
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) (`npm i -g @shopify/cli`)
- A [Shopify Partners account](https://partners.shopify.com) with a development store
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Steps

```bash
# 1. Clone / open the project
cd uni-pro

# 2. Install dependencies
npm install

# 3. Copy env and fill in your keys
cp .env.example .env
# Edit .env with your SHOPIFY_API_KEY, SHOPIFY_API_SECRET, OPENAI_API_KEY

# 4. Create and migrate the database
npx prisma migrate deploy
npx prisma generate

# 5. Link to your Shopify Partners app
npx shopify app config link

# 6. Start development server (auto-tunnels with ngrok)
npm run dev
```

The Shopify CLI will open a browser to install the app on your development store.

---

## Enabling the Widget on Your Store

1. Go to **Shopify Admin → Online Store → Themes → Customize**
2. Click **App embeds** (left sidebar)
3. Toggle **Aawaz Order Widget** ON
4. Set the **App API URL** to your deployed app URL + `/api/voice-order`  
   *(e.g. `https://your-app.fly.dev/api/voice-order`)*
5. Choose language (Urdu / Punjabi / Both) and widget color
6. Click **Save**

The microphone button will now appear on your store.

---

## Deployment (Fly.io)

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly launch
fly secrets set SHOPIFY_API_KEY=xxx SHOPIFY_API_SECRET=xxx OPENAI_API_KEY=xxx
fly secrets set DATABASE_URL="file:./dev.db"
fly deploy
```

For production, replace SQLite with a PostgreSQL database:
```
DATABASE_URL="postgresql://user:pass@host:5432/aawaz_order"
```

---

## API Reference

### `POST /api/voice-order`

Processes a voice recording and returns order details.

**Form Data:**
- `audio` — audio file (webm/mp4/ogg, max 15MB)
- `shop` — Shopify shop domain (e.g. `mystore.myshopify.com`)
- `language` — `ur` or `pa`

**Response stages:**
- `confirm` — order extracted, needs customer confirmation
- `missing_info` — some fields (name/phone/address) were not in the audio
- `product_not_found` — no matching product found in catalog
- `order_placed` — order created (auto-confirm mode)

All responses include `audio` (base64 MP3) for spoken Urdu feedback.

### `POST /api/voice-order?action=confirm`

Confirms a pending voice order and creates the Shopify draft order.

**JSON Body:**
```json
{ "voiceOrderId": "clx...", "shop": "mystore.myshopify.com" }
```

---

## Pakistan-Specific Notes

- **COD (Cash on Delivery)** is the default — no online payment needed
- Phone numbers are normalized to `03XXXXXXXXX` format
- Addresses support informal Pakistani formats (mohalla, colony, sector)
- Both Urdu script (نستعلیق) and Roman Urdu (typed Urdu in English letters) are handled by GPT-4o
- Noto Nastaliq Urdu font is loaded from Google Fonts for proper rendering
