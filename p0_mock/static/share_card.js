// share_card.js — 9:16 旅行手札分享卡，纯前端 html2canvas + Three.js 截图。

const SHARE_CARD_THEMES = {
  polar: {
    // 直接用知乎蓝 #1772F6 作为卡面主色
    background: '#1772f6',
    accent: '#1772f6',
    gold: '#e8d28a',
    label: '极地旅行',
    labelEn: 'POLAR JOURNEY',
    railEn: 'POLAR JOURNEY',
  },
  hotspot: {
    // 浅一些的暖玫红 — 不再黑沉,跟"陪伴感"更搭
    background: '#8e2638',
    accent: '#ee5872',
    gold: '#f5c87a',
    label: '热点旅行',
    labelEn: 'HOTSPOT REPORT',
    railEn: 'HOTSPOT REPORT',
  },
};

function ensureShareCardRoot() {
  let root = document.getElementById('shareCardRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'shareCardRoot';
    root.style.cssText = 'position:fixed;left:-9999px;top:0;width:750px;height:1280px;pointer-events:none;';
    document.body.appendChild(root);
  }
  return root;
}

function formatIssueDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return { ymd: `${y} / ${m} / ${day}`, vol: `${m}` };
}

function renderShareCardHtml({ theme, summary, petQuote, highlights, sceneDataUrl, level, levelTitle, shareBgImage, travelId }) {
  const themeMeta = SHARE_CARD_THEMES[theme] || SHARE_CARD_THEMES.polar;
  const { ymd, vol } = formatIssueDate();
  const issueNo = travelId ? String(travelId).slice(-2).padStart(2, '0') : vol;
  const list = Array.isArray(highlights) ? highlights.filter(Boolean).slice(0, 2) : [];
  const featuresBlock = list.length
    ? `
      <section class="share-card__features">
        <div class="share-card__features-head">
          <span class="share-card__features-line"></span>
          <span class="share-card__features-en">FEATURED</span>
          <span class="share-card__features-dot">·</span>
          <span class="share-card__features-cn">路上的发现</span>
          <span class="share-card__features-line"></span>
        </div>
        <ol class="share-card__features-list">
          ${list.map((item, i) => `
            <li>
              <span class="share-card__features-num">${String(i + 1).padStart(2, '0')}</span>
              <div class="share-card__features-body">
                <strong>${escapeShareHtml(item.title || '')}</strong>
                ${item.reason ? `<small>${escapeShareHtml(item.reason)}</small>` : ''}
              </div>
            </li>
          `).join('')}
        </ol>
      </section>
    ` : '';
  const summaryFallback = summary && !list.length
    ? `<section class="share-card__summary">${escapeShareHtml(summary)}</section>`
    : '';
  const bgImage = shareBgImage ? `, url('${escapeCssUrl(shareBgImage)}') center/cover no-repeat` : '';
  return `
    <div class="share-card share-card--${escapeShareHtml(theme || 'polar')}"
         style="background: radial-gradient(120% 70% at 20% 0%, rgba(255,255,255,0.08), transparent 60%), linear-gradient(170deg, ${shadeColor(themeMeta.background, 6)} 0%, ${themeMeta.background} 50%, ${shadeColor(themeMeta.background, -8)} 100%)${bgImage}">
      <header class="share-card__meta">
        <div class="share-card__meta-issue">
          <span class="share-card__meta-eyebrow">ISSUE NO.</span>
          <span class="share-card__meta-num">${escapeShareHtml(issueNo)}</span>
        </div>
        <div class="share-card__meta-date">${ymd}</div>
        <div class="share-card__meta-badge" style="border-color: ${hexAlpha(themeMeta.gold, 0.55)}; color: ${themeMeta.gold}">
          <span class="share-card__meta-star">★</span>
          <span class="share-card__meta-lv">Lv.${escapeShareHtml(level || 1)}</span>
          ${levelTitle ? `<span class="share-card__meta-lvtitle">${escapeShareHtml(levelTitle)}</span>` : ''}
        </div>
      </header>

      <section class="share-card__hero">
        <aside class="share-card__rail">
          <div class="share-card__rail-en" style="color: ${hexAlpha(themeMeta.accent, 0.95)}">
            ${themeMeta.railEn.split('').map(ch => ch === ' ' ? '<span class="share-card__rail-gap">·</span>' : `<span>${escapeShareHtml(ch)}</span>`).join('')}
          </div>
          <span class="share-card__rail-line" style="background:${hexAlpha(themeMeta.gold, 0.7)}"></span>
          <div class="share-card__rail-vol">
            ${`VOL.${issueNo}`.split('').map(ch => `<span>${escapeShareHtml(ch)}</span>`).join('')}
          </div>
        </aside>
        <div class="share-card__stage-wrap">
          <div class="share-card__stage"
               style="background-image: radial-gradient(34% 8% at 50% 97%, rgba(0,0,0,0.28), transparent 70%)${sceneDataUrl ? `, url('${sceneDataUrl}')` : ''}; background-size: 70% 6%, contain; background-position: center 96%, center bottom; background-repeat: no-repeat, no-repeat"></div>
          <div class="share-card__title">
            <span class="share-card__title-cn">${escapeShareHtml(themeMeta.label)}</span>
            <span class="share-card__title-en" style="color:${hexAlpha(themeMeta.gold, 0.9)}">${escapeShareHtml(themeMeta.labelEn)}</span>
          </div>
        </div>
      </section>

      <section class="share-card__quote" style="border-top-color:${hexAlpha(themeMeta.gold, 0.45)}">
        <span class="share-card__quote-mark" style="color:${themeMeta.gold}">&#10077;</span>
        <p>${escapeShareHtml(petQuote || '看山带回了一份小汇报')}</p>
        <span class="share-card__quote-cite">— Lv.${escapeShareHtml(level || 1)} ${escapeShareHtml(levelTitle || '')}</span>
      </section>

      ${featuresBlock}
      ${summaryFallback}

      <footer class="share-card__footer">
        <div class="share-card__brand">
          <span class="share-card__brand-cn">知乎 · 刘看山虚拟宠物</span>
          <span class="share-card__brand-en">ZHIHU · LIU KAN SHAN</span>
        </div>
        <div class="share-card__qr" style="border-color:${hexAlpha(themeMeta.gold, 0.5)}; color:${themeMeta.gold}">↗</div>
      </footer>
    </div>
  `;
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

function hexAlpha(hex, alpha) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeShareHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function escapeCssUrl(url) {
  // Inline-style + CSS url() context. The style attribute is wrapped in double
  // quotes, so any literal " inside url() would close the attribute early.
  // We URI-encode the URL (handles spaces, CJK, etc.) and additionally encode
  // single quotes and parentheses so the url(...) value can be safely wrapped
  // in single quotes inside a double-quoted style attribute.
  return encodeURI(String(url ?? '')).replace(/['()]/g, c =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

window.generateTravelShareCard = async function (handbookData) {
  if (window.__html2canvasFailed || typeof html2canvas !== 'function') {
    if (typeof showToast === 'function') {
      showToast('截图组件未加载，请右键保存预览图');
    }
    return null;
  }
  const theme = handbookData.theme || handbookData.coverStyle || 'polar';
  const sceneDataUrl = (window.character && typeof window.character.captureSceneSnapshot === 'function')
    ? window.character.captureSceneSnapshot({ background: SHARE_CARD_THEMES[theme]?.background })
    : null;
  const root = ensureShareCardRoot();
  let highlights = handbookData.llmHighlights || handbookData.highlights || [];
  if (typeof highlights === 'string') {
    try { highlights = JSON.parse(highlights); } catch { highlights = []; }
  }
  root.innerHTML = renderShareCardHtml({
    theme,
    summary: handbookData.llmSummary || handbookData.summary || '',
    petQuote: handbookData.llmPetQuote || handbookData.petQuote || '',
    highlights: Array.isArray(highlights) ? highlights : [],
    sceneDataUrl,
    level: handbookData.level,
    levelTitle: handbookData.levelTitle,
    shareBgImage: handbookData.shareBgImage,
    travelId: handbookData.travelId,
  });
  await new Promise(r => requestAnimationFrame(r));
  const canvas = await html2canvas(root.querySelector('.share-card'), {
    backgroundColor: null,
    width: 750,
    height: 1280,
    scale: 2,
    useCORS: true,
  });
  return canvas.toDataURL('image/png');
};

window.generateLeaderboardShareCard = async function (payload) {
  if (window.__html2canvasFailed || typeof html2canvas !== 'function') return null;
  const root = ensureShareCardRoot();
  const lbBg = payload.shareBgImage ? ` url('${escapeCssUrl(payload.shareBgImage)}') center/cover no-repeat` : '';
  root.innerHTML = `
    <div class="share-card leaderboard-share-card" style="background:#f4f9ff${lbBg}">
      <div class="leaderboard-share-visual">
        <img src="${escapeShareHtml(payload.level2dImage || '')}" alt="刘看山等级形象">
      </div>
      <div class="leaderboard-share-copy">
        <small>刘看山等级榜</small>
        <h1>Lv.${escapeShareHtml(payload.level ?? 1)}</h1>
        <strong>${escapeShareHtml(payload.levelTitle || '宇宙知识探索员')}</strong>
        <p>${escapeShareHtml(payload.slogan || '内容越读，看山越强')}</p>
      </div>
      <footer class="share-card__footer" style="border-top-color:rgba(31,35,41,0.12)">
        <div class="share-card__brand">
          <span class="share-card__brand-cn" style="color:#1f2329">知乎 · 刘看山虚拟宠物</span>
          <span class="share-card__brand-en" style="color:rgba(31,35,41,0.5)">ZHIHU · LIU KAN SHAN</span>
        </div>
        <div class="share-card__qr" style="border-color:rgba(31,35,41,0.25); color:#1772f6">↗</div>
      </footer>
    </div>
  `;
  await new Promise(r => requestAnimationFrame(r));
  const canvas = await html2canvas(root.querySelector('.share-card'), {
    backgroundColor: null,
    width: 750,
    height: 1280,
    scale: 2,
    useCORS: true,
  });
  return canvas.toDataURL('image/png');
};

window.openShareCardPreview = async function (handbookData) {
  const dataUrl = await window.generateTravelShareCard(handbookData);
  if (!dataUrl) return;
  const themeKey = handbookData.theme || handbookData.coverStyle || 'polar';
  const themeMeta = SHARE_CARD_THEMES[themeKey] || SHARE_CARD_THEMES.polar;
  const overlay = document.createElement('div');
  overlay.className = 'share-card-overlay';
  overlay.innerHTML = `
    <button class="share-card-close" type="button" aria-label="关闭">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </button>
    <div class="share-card-preview-modal" role="dialog" aria-modal="true" aria-label="旅行分享卡">
      <div class="share-card-preview-head">
        <span class="share-card-preview-eyebrow">YOUR ISSUE IS READY</span>
        <h3>这一期的旅行卡片出炉了</h3>
        <p>把 <em>${escapeShareHtml(themeMeta.label)}</em> 保存到本地，发给朋友也很合适</p>
      </div>
      <div class="share-card-preview-frame">
        <img class="share-card-preview-img" src="${dataUrl}" alt="旅行分享卡预览">
      </div>
      <div class="share-card-preview-actions">
        <a class="share-card-download-btn" href="${dataUrl}"
           download="liukanshan-${escapeShareHtml(themeKey)}-${escapeShareHtml(handbookData.travelId || Date.now())}.png">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          <span>下载这一期</span>
        </a>
        <button class="share-card-copy-btn" type="button">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/>
            <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" stroke="currentColor" stroke-width="1.6" fill="none"/>
          </svg>
          <span>复制图片</span>
        </button>
      </div>
      <p class="share-card-tip">右键图片也能直接保存到本地</p>
    </div>
  `;
  document.body.appendChild(overlay);
  let copyResetTimer = null;
  const onKey = (e) => { if (e.key === 'Escape') closeOverlay(); };
  const closeOverlay = () => {
    if (copyResetTimer) { clearTimeout(copyResetTimer); copyResetTimer = null; }
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.share-card-close').addEventListener('click', closeOverlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
  const copyBtn = overlay.querySelector('.share-card-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          const label = copyBtn.querySelector('span');
          if (label) label.textContent = '已复制 ✓';
          if (copyResetTimer) clearTimeout(copyResetTimer);
          copyResetTimer = setTimeout(() => {
            const l = copyBtn.querySelector('span');
            if (l) l.textContent = '复制图片';
            copyResetTimer = null;
          }, 1800);
        } else {
          throw new Error('clipboard unsupported');
        }
      } catch {
        if (typeof showToast === 'function') showToast('当前浏览器不支持复制图片，请右键保存');
      }
    });
  }
};
