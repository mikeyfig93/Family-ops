/* ============================================================
   FAMILY OPERATIONS CENTER — scanFlyer.js
   AI-powered flyer → event form auto-fill
   Uses Claude claude-sonnet-4-20250514 vision via Anthropic API
   ============================================================ */

const ScanFlyer = (() => {

  // ── EXTRACT EVENT DATA FROM IMAGE ────────────────────────
  async function extractFromImage(base64DataUrl) {
    // Strip the data:image/...;base64, prefix to get raw base64
    const matches = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) throw new Error('Invalid image data');

    const mimeType = matches[1];
    const base64Data = matches[2];

    const today = new Date().toISOString().slice(0, 10);
    const currentYear = new Date().getFullYear();

    const prompt = `You are a family assistant helping extract event information from a flyer or screenshot image.

Today's date is ${today}. Current year is ${currentYear}.

Carefully read ALL text visible in this image and extract every piece of event information you can find.

Return ONLY a valid JSON object — no markdown, no explanation, no code fences. Just the raw JSON.

JSON schema (use null for any field you cannot find):
{
  "title": "string — event name",
  "description": "string — full description of what the event is",
  "category": "one of: Sports, Arts, Music, Academic, Community, Medical, Government, Other",
  "date": "YYYY-MM-DD string — if only month/day found assume current or next upcoming year",
  "startTime": "HH:MM in 24-hour format or null",
  "endTime": "HH:MM in 24-hour format or null",
  "location": "string — venue name and/or address",
  "costEstimate": number or null — numeric dollars only, no symbols,
  "ageRestrictions": "string — e.g. All ages, 12 and under, 18+ or null",
  "registrationInfo": "string — deadline, URL, phone, registration instructions or null",
  "notes": "string — any other useful info from the flyer not captured above or null",
  "confidence": "high | medium | low — your confidence in the extraction"
}`;

    const apiKey = localStorage.getItem('foc_api_key') || '';
    if (!apiKey) throw new Error('No API key set. Go to Settings → Info → Set API Key.');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `API error ${response.status}`;
      throw new Error(msg);
    }

    const data = await response.json();
    const rawText = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return parsed;
  }

  // ── OPEN SCAN MODAL ──────────────────────────────────────
  function openScanModal(onResult) {
    // Check API key is set
    const apiKey = localStorage.getItem('foc_api_key') || '';

    if (!apiKey) {
      openApiKeySetup(() => openScanModal(onResult));
      return;
    }

    Modal.open('📷 Scan Event Flyer', `
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--slate-300);margin-bottom:16px;line-height:1.6;">
        Take a photo of an event flyer, poster, or screenshot. Claude will read it and auto-fill the event form.
      </div>

      <div class="form-group">
        <label class="form-label">Flyer Image</label>
        <div class="file-input-wrap" id="flyerInputWrap">
          <input type="file" id="flyerImageInput" accept="image/*" capture="environment" />
          <div class="file-input-label" id="flyerInputLabel">
            <span style="font-size:24px;display:block;margin-bottom:4px;">📷</span>
            Tap to take photo or choose image
          </div>
        </div>
      </div>

      <div id="flyerPreviewWrap" style="display:none;">
        <div class="attachment-preview" style="margin-bottom:12px;">
          <img id="flyerPreviewImg" src="" alt="Flyer preview" style="max-height:260px;width:100%;object-fit:contain;" />
        </div>
        <button class="btn btn-secondary btn-full btn-sm" id="flyerClearBtn">✕ Choose different image</button>
      </div>

      <div id="flyerStatus" style="display:none;margin-top:16px;">
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--navy-900);border-radius:8px;border:1px solid var(--navy-700);">
          <div class="spinner" style="margin:0;flex-shrink:0;width:20px;height:20px;border-width:2px;"></div>
          <div>
            <div style="font-family:var(--font-display);font-size:13px;font-weight:700;margin-bottom:2px;">Reading flyer…</div>
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--slate-300);" id="flyerStatusMsg">Sending to Claude AI</div>
          </div>
        </div>
      </div>

      <div id="flyerError" style="display:none;margin-top:12px;padding:12px;background:rgba(192,57,43,0.1);border:1px solid var(--red-600);border-radius:8px;font-family:var(--font-mono);font-size:11px;color:var(--red-200);"></div>

      <div id="flyerResultPreview" style="display:none;margin-top:16px;"></div>
    `, `
      <button class="btn btn-secondary" id="flyerCancelBtn">Cancel</button>
      <button class="btn btn-primary" id="flyerScanBtn" style="flex:1;" disabled>Scan Flyer</button>
    `);

    // Wire cancel
    $('flyerCancelBtn').addEventListener('click', Modal.close);

    // Wire file input
    $('flyerImageInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        $('flyerPreviewImg').src = ev.target.result;
        $('flyerPreviewWrap').style.display = 'block';
        $('flyerInputWrap').style.display = 'none';
        $('flyerScanBtn').disabled = false;
        $('flyerError').style.display = 'none';
        $('flyerResultPreview').style.display = 'none';
      };
      reader.readAsDataURL(file);
    });

    // Clear / re-choose
    $('flyerClearBtn').addEventListener('click', () => {
      $('flyerPreviewWrap').style.display = 'none';
      $('flyerInputWrap').style.display = 'block';
      $('flyerImageInput').value = '';
      $('flyerScanBtn').disabled = true;
      $('flyerError').style.display = 'none';
      $('flyerResultPreview').style.display = 'none';
      $('flyerStatus').style.display = 'none';
    });

    // Scan button
    $('flyerScanBtn').addEventListener('click', async () => {
      const imgSrc = $('flyerPreviewImg').src;
      if (!imgSrc) return;

      $('flyerScanBtn').disabled = true;
      $('flyerCancelBtn').disabled = true;
      $('flyerStatus').style.display = 'block';
      $('flyerError').style.display = 'none';
      $('flyerResultPreview').style.display = 'none';
      $('flyerStatusMsg').textContent = 'Sending to Claude AI…';

      try {
        $('flyerStatusMsg').textContent = 'Analyzing image…';
        const extracted = await extractFromImage(imgSrc);
        $('flyerStatus').style.display = 'none';

        // Show result preview
        showExtractionPreview(extracted, imgSrc, onResult);

      } catch (err) {
        $('flyerStatus').style.display = 'none';
        $('flyerError').style.display = 'block';
        $('flyerError').textContent = '⚠ ' + (err.message || 'Scan failed. Check your API key and try again.');
        $('flyerScanBtn').disabled = false;
        $('flyerCancelBtn').disabled = false;
      }
    });
  }

  // ── SHOW EXTRACTION PREVIEW ──────────────────────────────
  function showExtractionPreview(data, imgSrc, onResult) {
    const preview = $('flyerResultPreview');
    preview.style.display = 'block';

    const confColor = { high: 'var(--green-400)', medium: 'var(--amber-200)', low: 'var(--red-200)' }[data.confidence] || 'var(--slate-300)';

    const fields = [
      { label: 'Title',        val: data.title },
      { label: 'Date',         val: data.date },
      { label: 'Start Time',   val: data.startTime },
      { label: 'End Time',     val: data.endTime },
      { label: 'Location',     val: data.location },
      { label: 'Category',     val: data.category },
      { label: 'Cost',         val: data.costEstimate != null ? '$' + data.costEstimate : null },
      { label: 'Age',          val: data.ageRestrictions },
      { label: 'Registration', val: data.registrationInfo },
      { label: 'Description',  val: data.description },
      { label: 'Notes',        val: data.notes },
    ].filter(f => f.val);

    preview.innerHTML = `
      <div style="background:var(--navy-900);border:1px solid var(--green-600);border-radius:8px;padding:12px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--green-400);">✓ Extraction complete</div>
          <span style="font-family:var(--font-mono);font-size:9px;color:${confColor};text-transform:uppercase;letter-spacing:.06em;">${data.confidence || '?'} confidence</span>
        </div>
        ${fields.map(f => `
          <div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--navy-800);">
            <span style="font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--slate-400);flex-shrink:0;width:80px;padding-top:1px;">${f.label}</span>
            <span style="font-size:12px;color:var(--white);line-height:1.4;">${escHtml(String(f.val))}</span>
          </div>
        `).join('')}
      </div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--slate-400);margin-bottom:8px;">Review the fields above, then tap to open the pre-filled event form where you can make any corrections.</div>
    `;

    // Replace footer buttons
    $('modalFooter').innerHTML = `
      <button class="btn btn-secondary" id="flyerRescan">↺ Rescan</button>
      <button class="btn btn-primary" id="flyerFillForm" style="flex:1;">Fill Event Form →</button>
    `;

    $('flyerRescan').addEventListener('click', () => {
      $('flyerClearBtn').click();
      $('modalFooter').innerHTML = `
        <button class="btn btn-secondary" id="flyerCancelBtn">Cancel</button>
        <button class="btn btn-primary" id="flyerScanBtn" style="flex:1;" disabled>Scan Flyer</button>
      `;
      $('flyerCancelBtn').addEventListener('click', Modal.close);
      $('flyerScanBtn').addEventListener('click', () => {});
    });

    $('flyerFillForm').addEventListener('click', () => {
      Modal.close();
      // Small delay so modal close animation finishes
      setTimeout(() => {
        onResult(data);
      }, 120);
    });
  }

  // ── API KEY SETUP ────────────────────────────────────────
  function openApiKeySetup(afterSave) {
    Modal.open('🔑 API Key Required', `
      <div style="font-family:var(--font-body);font-size:14px;color:var(--slate-200);line-height:1.6;margin-bottom:16px;">
        The flyer scanner uses Claude AI to read your images. You need a free Anthropic API key.
      </div>
      <div style="background:var(--navy-900);border:1px solid var(--navy-700);border-radius:8px;padding:12px;margin-bottom:16px;font-family:var(--font-mono);font-size:11px;color:var(--slate-300);line-height:1.8;">
        1. Go to <strong style="color:var(--green-400);">console.anthropic.com</strong><br>
        2. Sign up / log in (free tier available)<br>
        3. Go to API Keys → Create Key<br>
        4. Paste your key below
      </div>
      <div class="form-group">
        <label class="form-label" for="apiKeyInput">Anthropic API Key</label>
        <input class="form-input" id="apiKeyInput" type="password" placeholder="sk-ant-…" autocomplete="off" spellcheck="false"/>
        <div class="form-hint">Stored only on this device. Never sent anywhere except Anthropic's API.</div>
      </div>
      <div id="apiKeyError" style="display:none;margin-top:8px;font-family:var(--font-mono);font-size:11px;color:var(--red-200);"></div>
    `, `
      <button class="btn btn-secondary" id="apiKeyCancel">Cancel</button>
      <button class="btn btn-primary" id="apiKeySave" style="flex:1;">Save Key</button>
    `);

    $('apiKeyCancel').addEventListener('click', Modal.close);
    $('apiKeySave').addEventListener('click', () => {
      const key = $('apiKeyInput').value.trim();
      if (!key.startsWith('sk-ant-')) {
        $('apiKeyError').style.display = 'block';
        $('apiKeyError').textContent = 'Key should start with sk-ant-…';
        return;
      }
      localStorage.setItem('foc_api_key', key);
      Modal.close();
      showToast('API key saved');
      if (afterSave) setTimeout(afterSave, 150);
    });
  }

  // ── PUBLIC ───────────────────────────────────────────────
  return {
    openScanModal,
    openApiKeySetup,
    extractFromImage,
  };
})();
