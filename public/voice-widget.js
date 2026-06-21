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
    modal_subtitle: "بٹن دبائیں اور اپنا آرڈر بتائیں",
    hint:
      'مثال: "مجھے ۲ کلو آم چاہیے، میرا نام احمد ہے، لاہور گلبرگ، نمبر ۰۳۰۰۱۲۳۴۵۶۷"',
    mic_start: "بولنا شروع کریں",
    mic_stop: "رکیں",
    recording: "سن رہے ہیں…",
    processing: "پروسیسنگ ہو رہی ہے…",
    confirm_title: "آرڈر کی تصدیق کریں",
    confirm_btn: "تصدیق کریں ✓",
    cancel_btn: "منسوخ ✗",
    retry_btn: "دوبارہ کوشش کریں 🎤",
    close_btn: "بند کریں",
    success_title: "آپ کا آرڈر ہو گیا! ✓",
    success_sub: "دکاندار جلد آپ سے رابطہ کرے گا۔",
    missing_title: "کچھ معلومات درکار ہے",
    not_found_title: "پروڈکٹ نہیں ملا",
    not_found_sub: "براہ کرم دوبارہ کوشش کریں",
    error_title: "خرابی",
    error_sub: "معذرت، دوبارہ کوشش کریں",
    product_label: "پروڈکٹ",
    qty_label: "مقدار",
    price_label: "قیمت",
    name_label: "نام",
    phone_label: "فون",
    address_label: "پتہ",
    rs: "روپے",
  };

  // ── State ─────────────────────────────────────────────────────────────────
  const STATE = {
    stage: "idle",        // idle | recording | processing | confirm | missing | not_found | success | error
    mediaRecorder: null,
    audioChunks: [],
    voiceOrderId: null,
    lastResult: null,
    audioPlayer: new Audio(),
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
    stopRecording();
  }

  // ── Audio recording ───────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      STATE.audioChunks = [];

      const options = getSupportedMimeType();
      STATE.mediaRecorder = new MediaRecorder(stream, options);

      STATE.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) STATE.audioChunks.push(e.data);
      };

      STATE.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        sendAudio();
      };

      STATE.mediaRecorder.start(250);
      showStage("idle");
      micBtn.classList.add("aawaz-recording");
      micStatus.textContent = STR.recording;
    } catch (err) {
      console.error("[AawazOrder] Microphone error:", err);
      showError("مائیکروفون تک رسائی نہیں ملی۔ براہ کرم اجازت دیں۔");
    }
  }

  function stopRecording() {
    if (STATE.mediaRecorder && STATE.mediaRecorder.state !== "inactive") {
      STATE.mediaRecorder.stop();
    }
    micBtn.classList.remove("aawaz-recording");
  }

  function getSupportedMimeType() {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return { mimeType: type };
    }
    return {};
  }

  // ── Send audio to API ─────────────────────────────────────────────────────
  async function sendAudio() {
    showStage("processing");

    const mimeType =
      STATE.mediaRecorder?.mimeType || "audio/webm";
    const ext = mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("mp4")
        ? "mp4"
        : "webm";

    const blob = new Blob(STATE.audioChunks, { type: mimeType });

    if (blob.size < 1000) {
      showError("آواز بہت چھوٹی ہے۔ براہ کرم واضح آواز میں بولیں۔");
      return;
    }

    const formData = new FormData();
    formData.append("audio", blob, `recording.${ext}`);
    formData.append("shop", CONFIG.shop);
    formData.append("language", CONFIG.language === "both" ? "ur" : CONFIG.language);

    try {
      const res = await fetch(CONFIG.apiUrl, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      STATE.lastResult = data;

      if (!res.ok) {
        showError(data.error || STR.error_sub);
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

    confirmCard.innerHTML = `
      ${p && p.imageUrl
        ? `<img class="aawaz-product-img" src="${p.imageUrl}" alt="${p.title}" />`
        : ""}
      <div class="aawaz-info-row">
        <span class="aawaz-info-label">${STR.product_label}</span>
        <span class="aawaz-info-value">${p ? p.title : e.product_query_original}</span>
      </div>
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
    };
    const missingText = (data.missing_fields || [])
      .map((f) => fieldLabels[f] || f)
      .join("، ");
    $("aawaz-missing-text").textContent =
      `براہ کرم ${missingText} بھی بتائیں۔`;
    showStage("missing");
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

  // Mic button — press-and-hold on desktop, tap-to-toggle on mobile
  let isHoldMode = false;
  let holdTimer = null;

  micBtn.addEventListener("mousedown", () => {
    holdTimer = setTimeout(() => {
      isHoldMode = true;
      startRecording();
    }, 150);
  });

  micBtn.addEventListener("mouseup", () => {
    clearTimeout(holdTimer);
    if (isHoldMode) {
      isHoldMode = false;
      stopRecording();
    } else if (STATE.stage === "idle") {
      // Tap mode
      if (STATE.mediaRecorder && STATE.mediaRecorder.state === "recording") {
        stopRecording();
      } else {
        startRecording();
      }
    }
  });

  // Touch support (mobile)
  micBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startRecording();
  }, { passive: false });

  micBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    stopRecording();
  }, { passive: false });

  // Confirm button
  $("aawaz-confirm-btn").addEventListener("click", confirmOrder);

  // Cancel — back to idle
  $("aawaz-cancel-btn").addEventListener("click", () => {
    STATE.voiceOrderId = null;
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
