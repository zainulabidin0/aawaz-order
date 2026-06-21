(function () {
  "use strict";

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  const root = document.getElementById("aawaz-order-root");
  if (!root) return;

  const CONFIG = {
    shop: root.dataset.shop || (window.Shopify && window.Shopify.shop) || "",
    language: root.dataset.language || "ur",
    color: root.dataset.color || "#16a34a",
    apiUrl: root.dataset.apiUrl || "",
    position: root.dataset.position || "bottom-right",
  };

  if (!CONFIG.apiUrl) {
    console.warn("[AawazOrder] api_url not configured in Theme Editor settings.");
    return;
  }

  // ── Urdu / Punjabi UI strings ─────────────────────────────────────────────
  const STR = {
    fab_label: "آواز آرڈر",
    modal_title: "آواز سے آرڈر کریں",
    modal_subtitle: "مائیک آن کریں اور اپنا آرڈر بولیں",
    hint:
      'مثال: "مجھے ۲ کلو آم چاہیے، میرا نام احمد ہے، لاہور گلبرگ، نمبر ۰۳۰۰۱۲۳۴۵۶۷"',
    mic_start: "مائیک آن کریں",
    mic_stop: "ختم کریں",
    listening: "سن رہے ہیں — ابھی بولیں…",
    listening_sub: "جب بولنا ختم ہو جائے تو خود بند ہو جائے گا",
    processing: "پروسیسنگ ہو رہی ہے…",
    confirm_title: "آرڈر کی تصدیق کریں",
    confirm_btn: "تصدیق کریں ✓",
    cancel_btn: "منسوخ ✗",
    retry_btn: "دوبارہ کوشش کریں 🎤",
    close_btn: "بند کریں",
    success_title: "آپ کا آرڈر ہو گیا! ✓",
    success_sub: "دکاندار جلد آپ سے رابطہ کرے گا۔",
    missing_title: "کچھ معلومات درکار ہے",
    variant_title: "سائز یا رنگ منتخب کریں",
    variant_sub: "اپنی پسند کا آپشن ٹیپ کریں",
    not_found_title: "پروڈکٹ نہیں ملا",
    not_found_sub: "براہ کرم دوبارہ کوشش کریں",
    error_title: "خرابی",
    error_sub: "معذرت، دوبارہ کوشش کریں",
    reconnect_sub:
      "دکاندار کو Shopify ایڈمن میں Aawaz Order ایپ کھولنی ہوگی۔",
    product_label: "پروڈکٹ",
    variant_label: "سائز / رنگ",
    qty_label: "مقدار",
    price_label: "قیمت",
    name_label: "نام",
    phone_label: "فون",
    address_label: "پتہ",
    rs: "روپے",
  };

  // ── State ─────────────────────────────────────────────────────────────────
  const STATE = {
    stage: "idle",
    mediaRecorder: null,
    audioChunks: [],
    voiceOrderId: null,
    lastResult: null,
    audioPlayer: new Audio(),
    mediaStream: null,
    audioContext: null,
    analyser: null,
    vadFrame: null,
    recordingStartedAt: 0,
    heardSpeech: false,
    silenceSince: 0,
  };

  const VAD = {
    minMs: 900,
    silenceMs: 1400,
    maxMs: 45000,
    threshold: 0.018,
  };

  // ── Inject HTML ───────────────────────────────────────────────────────────
  const isRight = CONFIG.position !== "bottom-left";

  const html = `
<div id="aawaz-fab" role="button" tabindex="0" aria-label="${STR.fab_label}" title="${STR.fab_label}">
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
  <span id="aawaz-fab-label">${STR.fab_label}</span>
</div>

<div id="aawaz-overlay" role="dialog" aria-modal="true" aria-label="${STR.modal_title}">
  <div id="aawaz-modal">
    <button id="aawaz-close" aria-label="${STR.close_btn}">✕</button>

    <!-- IDLE stage -->
    <div class="aawaz-stage" id="aawaz-stage-idle">
      <div class="aawaz-logo">🎤</div>
      <h2>${STR.modal_title}</h2>
      <p class="aawaz-sub">${STR.modal_subtitle}</p>
      <button id="aawaz-mic-btn" class="aawaz-mic-btn" aria-label="${STR.mic_start}">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>
      <p id="aawaz-mic-status" class="aawaz-hint">${STR.hint}</p>
    </div>

    <!-- LIVE LISTENING stage -->
    <div class="aawaz-stage aawaz-hidden" id="aawaz-stage-listening">
      <div class="aawaz-listening-ring">
        <button id="aawaz-live-mic" class="aawaz-mic-btn aawaz-recording" aria-label="${STR.listening}">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>
      </div>
      <h2>${STR.listening}</h2>
      <p class="aawaz-sub">${STR.listening_sub}</p>
      <div id="aawaz-waveform" class="aawaz-waveform" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span>
        <span></span><span></span><span></span><span></span><span></span>
      </div>
      <button id="aawaz-stop-btn" class="aawaz-btn aawaz-btn-ghost">${STR.mic_stop}</button>
    </div>

    <!-- PROCESSING stage -->
    <div class="aawaz-stage aawaz-hidden" id="aawaz-stage-processing">
      <div class="aawaz-spinner"></div>
      <p class="aawaz-processing-text">${STR.processing}</p>
    </div>

    <!-- CONFIRM stage -->
    <div class="aawaz-stage aawaz-hidden" id="aawaz-stage-confirm">
      <div class="aawaz-confirm-icon">📋</div>
      <h2>${STR.confirm_title}</h2>
      <div id="aawaz-confirm-card" class="aawaz-info-card"></div>
      <div class="aawaz-btn-row">
        <button id="aawaz-confirm-btn" class="aawaz-btn aawaz-btn-primary">${STR.confirm_btn}</button>
        <button id="aawaz-cancel-btn" class="aawaz-btn aawaz-btn-ghost">${STR.cancel_btn}</button>
      </div>
    </div>

    <!-- MISSING INFO stage -->
    <div class="aawaz-stage aawaz-hidden" id="aawaz-stage-missing">
      <div class="aawaz-confirm-icon">📝</div>
      <h2>${STR.missing_title}</h2>
      <p id="aawaz-missing-text" class="aawaz-sub"></p>
      <div class="aawaz-btn-row">
        <button id="aawaz-retry-btn" class="aawaz-btn aawaz-btn-primary">${STR.retry_btn}</button>
      </div>
    </div>

    <!-- VARIANT SELECTION stage -->
    <div class="aawaz-stage aawaz-hidden" id="aawaz-stage-select-variant">
      <div class="aawaz-confirm-icon">🎨</div>
      <h2>${STR.variant_title}</h2>
      <p id="aawaz-variant-sub" class="aawaz-sub">${STR.variant_sub}</p>
      <div id="aawaz-variant-list" class="aawaz-variant-list"></div>
      <button id="aawaz-variant-voice-btn" class="aawaz-btn aawaz-btn-ghost">${STR.retry_btn}</button>
    </div>

    <!-- NOT FOUND stage -->
    <div class="aawaz-stage aawaz-hidden" id="aawaz-stage-not-found">
      <div class="aawaz-confirm-icon">🔍</div>
      <h2>${STR.not_found_title}</h2>
      <p id="aawaz-not-found-text" class="aawaz-sub">${STR.not_found_sub}</p>
      <button id="aawaz-retry-nf-btn" class="aawaz-btn aawaz-btn-primary">${STR.retry_btn}</button>
    </div>

    <!-- SUCCESS stage -->
    <div class="aawaz-stage aawaz-hidden" id="aawaz-stage-success">
      <div class="aawaz-success-icon">✅</div>
      <h2>${STR.success_title}</h2>
      <p class="aawaz-sub">${STR.success_sub}</p>
      <p id="aawaz-order-name" class="aawaz-order-num"></p>
      <button id="aawaz-done-btn" class="aawaz-btn aawaz-btn-primary">${STR.close_btn}</button>
    </div>

    <!-- ERROR stage -->
    <div class="aawaz-stage aawaz-hidden" id="aawaz-stage-error">
      <div class="aawaz-confirm-icon">⚠️</div>
      <h2>${STR.error_title}</h2>
      <p id="aawaz-error-text" class="aawaz-sub">${STR.error_sub}</p>
      <button id="aawaz-retry-err-btn" class="aawaz-btn aawaz-btn-primary">${STR.retry_btn}</button>
    </div>

  </div>
</div>`;

  const container = document.createElement("div");
  container.id = "aawaz-container";
  container.innerHTML = html;
  document.body.appendChild(container);

  // ── Element refs ──────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const fab = $("aawaz-fab");
  const overlay = $("aawaz-overlay");
  const micBtn = $("aawaz-mic-btn");
  const micStatus = $("aawaz-mic-status");
  const confirmCard = $("aawaz-confirm-card");

  // Position FAB
  fab.style.setProperty(isRight ? "right" : "left", "20px");

  // ── Stage management ──────────────────────────────────────────────────────
  function showStage(name) {
    document.querySelectorAll(".aawaz-stage").forEach((el) => {
      el.classList.add("aawaz-hidden");
    });
    const stage = $("aawaz-stage-" + name);
    if (stage) stage.classList.remove("aawaz-hidden");
    STATE.stage = name;
  }

  function openModal() {
    overlay.classList.add("aawaz-active");
    showStage("idle");
    micStatus.textContent = STR.hint;
    micBtn.classList.remove("aawaz-recording");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    overlay.classList.remove("aawaz-active");
    document.body.style.overflow = "";
    stopListening(false);
  }

  function cleanupAudioGraph() {
    if (STATE.vadFrame) {
      cancelAnimationFrame(STATE.vadFrame);
      STATE.vadFrame = null;
    }
    if (STATE.mediaStream) {
      STATE.mediaStream.getTracks().forEach((t) => t.stop());
      STATE.mediaStream = null;
    }
    if (STATE.audioContext) {
      STATE.audioContext.close().catch(() => {});
      STATE.audioContext = null;
    }
    STATE.analyser = null;
  }

  // ── Real-time microphone listening ────────────────────────────────────────
  async function startListening() {
    if (STATE.mediaRecorder && STATE.mediaRecorder.state === "recording") {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      STATE.mediaStream = stream;
      STATE.audioChunks = [];
      STATE.recordingStartedAt = Date.now();
      STATE.heardSpeech = false;
      STATE.silenceSince = 0;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        STATE.audioContext = new AudioCtx();
        const source = STATE.audioContext.createMediaStreamSource(stream);
        STATE.analyser = STATE.audioContext.createAnalyser();
        STATE.analyser.fftSize = 256;
        STATE.analyser.smoothingTimeConstant = 0.65;
        source.connect(STATE.analyser);
      }

      const options = getSupportedMimeType();
      STATE.mediaRecorder = new MediaRecorder(stream, options);

      STATE.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) STATE.audioChunks.push(e.data);
      };

      STATE.mediaRecorder.onstop = () => {
        cleanupAudioGraph();
        sendAudio();
      };

      STATE.mediaRecorder.start(200);
      showStage("listening");
      startVoiceActivityMonitor();
    } catch (err) {
      console.error("[AawazOrder] Microphone error:", err);
      showError("مائیکروفون تک رسائی نہیں ملی۔ براہ کرم اجازت دیں۔");
    }
  }

  function startVoiceActivityMonitor() {
    const waveform = $("aawaz-waveform");
    const bars = waveform ? waveform.querySelectorAll("span") : [];
    const timeData = new Uint8Array(STATE.analyser ? STATE.analyser.fftSize : 0);

    const tick = () => {
      if (!STATE.analyser) {
        STATE.vadFrame = requestAnimationFrame(tick);
        return;
      }

      STATE.analyser.getByteTimeDomainData(timeData);
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / timeData.length);

      bars.forEach((bar, i) => {
        const scale = Math.min(1, rms * (4 + i * 0.35));
        bar.style.transform = `scaleY(${0.15 + scale})`;
      });

      const elapsed = Date.now() - STATE.recordingStartedAt;
      if (rms > VAD.threshold) {
        STATE.heardSpeech = true;
        STATE.silenceSince = 0;
      } else if (STATE.heardSpeech) {
        if (!STATE.silenceSince) STATE.silenceSince = Date.now();
        if (
          elapsed >= VAD.minMs &&
          Date.now() - STATE.silenceSince >= VAD.silenceMs
        ) {
          stopListening(true);
          return;
        }
      }

      if (elapsed >= VAD.maxMs) {
        stopListening(true);
        return;
      }

      STATE.vadFrame = requestAnimationFrame(tick);
    };

    STATE.vadFrame = requestAnimationFrame(tick);
  }

  function stopListening(shouldProcess) {
    if (STATE.vadFrame) {
      cancelAnimationFrame(STATE.vadFrame);
      STATE.vadFrame = null;
    }

    if (STATE.mediaRecorder && STATE.mediaRecorder.state === "recording") {
      try {
        STATE.mediaRecorder.requestData();
      } catch (_) {
        /* ignore */
      }
      STATE.mediaRecorder.stop();
    } else if (!shouldProcess) {
      cleanupAudioGraph();
    }

    micBtn.classList.remove("aawaz-recording");
  }

  function getSupportedMimeType() {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/mp4;codecs=mp4a",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return { mimeType: type };
    }
    return {};
  }

  function extensionForMime(mimeType) {
    if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    return "webm";
  }

  /** Encode AudioBuffer as 16-bit PCM WAV — Whisper accepts this reliably. */
  function audioBufferToWavBlob(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataLength = audioBuffer.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    function writeString(offset, str) {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  /** Decode browser recording and re-encode as WAV for OpenAI compatibility. */
  async function toWhisperCompatibleBlob(blob) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return blob;

      const ctx = new AudioCtx();
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      await ctx.close();
      return audioBufferToWavBlob(audioBuffer);
    } catch (err) {
      console.warn("[AawazOrder] WAV conversion failed, using original blob", err);
      return blob;
    }
  }

  // ── Send audio to API ─────────────────────────────────────────────────────
  async function sendAudio() {
    showStage("processing");

    const mimeType = STATE.mediaRecorder?.mimeType || "audio/webm";
    const rawBlob = new Blob(STATE.audioChunks, {
      type: STATE.audioChunks[0]?.type || mimeType,
    });

    if (rawBlob.size < 1000) {
      showError("آواز بہت چھوٹی ہے۔ براہ کرم واضح آواز میں بولیں۔");
      return;
    }

    const uploadBlob = await toWhisperCompatibleBlob(rawBlob);
    const uploadMime = uploadBlob.type || "audio/wav";
    const ext = extensionForMime(uploadMime);

    const formData = new FormData();
    formData.append("audio", uploadBlob, `recording.${ext}`);
    formData.append("mime_type", uploadMime);
    formData.append("shop", CONFIG.shop);
    formData.append("language", CONFIG.language === "both" ? "ur" : CONFIG.language);
    if (STATE.voiceOrderId) {
      formData.append("voiceOrderId", STATE.voiceOrderId);
    }

    try {
      const res = await fetch(CONFIG.apiUrl, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      STATE.lastResult = data;

      if (!res.ok) {
        const msg =
          data.code === "shop_reconnect_required"
            ? STR.reconnect_sub
            : data.error || STR.error_sub;
        showError(msg);
        playAudio(data.audio);
        return;
      }

      handleApiResponse(data);
    } catch (err) {
      console.error("[AawazOrder] API error:", err);
      showError("نیٹ ورک کی خرابی۔ دوبارہ کوشش کریں۔");
    }
  }

  // ── Handle API response stages ────────────────────────────────────────────
  function handleApiResponse(data) {
    playAudio(data.audio);

    switch (data.stage) {
      case "confirm":
        showConfirmStage(data);
        break;

      case "missing_info":
        showMissingStage(data);
        break;

      case "select_variant":
        showVariantStage(data);
        break;

      case "product_not_found":
        showNotFoundStage(data);
        break;

      case "order_placed":
        showSuccessStage(data);
        break;

      default:
        showError(data.error || STR.error_sub);
    }
  }

  function showConfirmStage(data) {
    const e = data.extraction;
    const p = data.product;
    const price = p ? `Rs. ${parseFloat(p.price).toFixed(0)}` : "—";
    const qty = `${e.quantity} ${e.unit}`;
    const variantLabel =
      p && p.variantTitle && p.variantTitle !== "Default Title"
        ? p.variantTitle
        : null;

    confirmCard.innerHTML = `
      ${p && p.imageUrl
        ? `<img class="aawaz-product-img" src="${p.imageUrl}" alt="${p.title}" />`
        : ""}
      <div class="aawaz-info-row">
        <span class="aawaz-info-label">${STR.product_label}</span>
        <span class="aawaz-info-value">${p ? p.title : e.product_query_original}</span>
      </div>
      ${variantLabel
        ? `<div class="aawaz-info-row">
        <span class="aawaz-info-label">${STR.variant_label}</span>
        <span class="aawaz-info-value">${variantLabel}</span>
      </div>`
        : ""}
      <div class="aawaz-info-row">
        <span class="aawaz-info-label">${STR.qty_label}</span>
        <span class="aawaz-info-value">${qty}</span>
      </div>
      <div class="aawaz-info-row">
        <span class="aawaz-info-label">${STR.price_label}</span>
        <span class="aawaz-info-value aawaz-price">${price}</span>
      </div>
      <div class="aawaz-divider"></div>
      <div class="aawaz-info-row">
        <span class="aawaz-info-label">${STR.name_label}</span>
        <span class="aawaz-info-value">${e.customer_name || "—"}</span>
      </div>
      <div class="aawaz-info-row">
        <span class="aawaz-info-label">${STR.phone_label}</span>
        <span class="aawaz-info-value" dir="ltr">${e.phone || "—"}</span>
      </div>
      <div class="aawaz-info-row">
        <span class="aawaz-info-label">${STR.address_label}</span>
        <span class="aawaz-info-value">${e.full_address || "—"}</span>
      </div>
    `;

    STATE.voiceOrderId = data.voiceOrderId;
    showStage("confirm");
  }

  function showMissingStage(data) {
    const fieldLabels = {
      customer_name: "نام",
      phone: "فون نمبر",
      full_address: "پتہ",
      size: "سائز",
      color: "رنگ",
      Size: "سائز",
      Color: "رنگ",
    };
    const missingText = (data.missing_fields || [])
      .map((f) => fieldLabels[f] || f)
      .join("، ");
    $("aawaz-missing-text").textContent =
      `براہ کرم ${missingText} بھی بتائیں۔`;
    if (data.voiceOrderId) STATE.voiceOrderId = data.voiceOrderId;
    showStage("missing");
  }

  function showVariantStage(data) {
    const list = $("aawaz-variant-list");
    const variants = data.variants || [];
    list.innerHTML = variants
      .map((v) => {
        const label =
          v.selectedOptions && v.selectedOptions.length
            ? v.selectedOptions
                .filter((o) => o.name !== "Title")
                .map((o) => o.value)
                .join(" / ") || v.title
            : v.title;
        const price = `Rs. ${parseFloat(v.price).toFixed(0)}`;
        return `<button type="button" class="aawaz-variant-chip" data-variant-id="${v.id}">
          <span class="aawaz-variant-chip-label">${label}</span>
          <span class="aawaz-variant-chip-price">${price}</span>
        </button>`;
      })
      .join("");

    list.querySelectorAll(".aawaz-variant-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectVariant(btn.getAttribute("data-variant-id"), data);
      });
    });

    if (data.missing_options && data.missing_options.length) {
      $("aawaz-variant-sub").textContent =
        `براہ کرم ${data.missing_options.join(" / ")} منتخب کریں`;
    }

    showStage("select-variant");
  }

  async function selectVariant(variantId, data) {
    if (!variantId || !data) return;
    showStage("processing");

    try {
      const res = await fetch(CONFIG.apiUrl + "?action=select_variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: CONFIG.shop,
          variantId,
          productId: data.product.id,
          extraction: data.extraction,
          transcript: data.transcript,
          voiceOrderId: data.voiceOrderId || STATE.voiceOrderId || null,
        }),
      });

      const result = await res.json();
      STATE.lastResult = result;
      playAudio(result.audio);

      if (!res.ok) {
        showError(result.error || STR.error_sub);
        return;
      }

      handleApiResponse(result);
    } catch (err) {
      showError("نیٹ ورک کی خرابی۔ دوبارہ کوشش کریں۔");
    }
  }

  function showNotFoundStage(data) {
    const q = data.extraction?.product_query_original || "";
    $("aawaz-not-found-text").textContent =
      q ? `"${q}" نہیں ملا۔ دوبارہ کوشش کریں۔` : STR.not_found_sub;
    showStage("not-found");
  }

  function showSuccessStage(data) {
    const orderNum = data.order?.orderName || "";
    $("aawaz-order-name").textContent = orderNum ? `آرڈر نمبر: ${orderNum}` : "";
    showStage("success");
  }

  function showError(msg) {
    $("aawaz-error-text").textContent = msg;
    showStage("error");
  }

  // ── Confirm order ─────────────────────────────────────────────────────────
  async function confirmOrder() {
    if (!STATE.voiceOrderId) return;
    showStage("processing");

    try {
      const res = await fetch(CONFIG.apiUrl + "?action=confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceOrderId: STATE.voiceOrderId,
          shop: CONFIG.shop,
        }),
      });

      const data = await res.json();
      playAudio(data.audio);

      if (!res.ok) {
        showError(data.error || STR.error_sub);
        return;
      }

      showSuccessStage(data);
    } catch (err) {
      showError("نیٹ ورک کی خرابی۔ دوبارہ کوشش کریں۔");
    }
  }

  // ── TTS audio playback ────────────────────────────────────────────────────
  function playAudio(base64) {
    if (!base64) return;
    try {
      STATE.audioPlayer.pause();
      STATE.audioPlayer.src = "data:audio/mp3;base64," + base64;
      STATE.audioPlayer.play().catch(() => {});
    } catch (_) {}
  }

  // ── Event wiring ──────────────────────────────────────────────────────────
  // FAB open
  fab.addEventListener("click", openModal);
  fab.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openModal();
  });

  // Close button
  $("aawaz-close").addEventListener("click", closeModal);

  // Overlay background click → close
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  // Mic — tap once to open live listening (no hold-to-record)
  micBtn.addEventListener("click", () => {
    if (STATE.stage === "idle") startListening();
  });

  $("aawaz-stop-btn").addEventListener("click", () => stopListening(true));

  $("aawaz-live-mic").addEventListener("click", () => stopListening(true));

  // Confirm button
  $("aawaz-confirm-btn").addEventListener("click", confirmOrder);

  // Cancel — back to idle
  $("aawaz-cancel-btn").addEventListener("click", () => {
    STATE.voiceOrderId = null;
    showStage("idle");
    micStatus.textContent = STR.hint;
  });

  $("aawaz-variant-voice-btn").addEventListener("click", () => {
    showStage("idle");
    micStatus.textContent = STR.hint;
  });

  // Retry buttons
  ["aawaz-retry-btn", "aawaz-retry-nf-btn", "aawaz-retry-err-btn"].forEach(
    (id) => {
      const btn = $(id);
      if (btn)
        btn.addEventListener("click", () => {
          showStage("idle");
          micStatus.textContent = STR.hint;
        });
    }
  );

  // Done button (success)
  $("aawaz-done-btn").addEventListener("click", closeModal);

  // Keyboard: Escape → close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("aawaz-active")) {
      closeModal();
    }
  });

  // Apply brand color to CSS variable
  document.documentElement.style.setProperty("--aawaz-color", CONFIG.color);
  document.documentElement.style.setProperty(
    "--aawaz-color-dark",
    darkenHex(CONFIG.color, 20)
  );

  // ── Utility ───────────────────────────────────────────────────────────────
  function darkenHex(hex, amount) {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, (num >> 16) - amount);
    const g = Math.max(0, ((num >> 8) & 0xff) - amount);
    const b = Math.max(0, (num & 0xff) - amount);
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  }
})();
