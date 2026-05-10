// share_card.js — 9:16 旅行手札分享卡，纯前端 html2canvas + Three.js 截图。

const SHARE_CARD_THEMES = {
  polar: { background: '#0b1730', accent: '#5fa8ff', label: '极地旅行' },
  hotspot: { background: '#3a0a0e', accent: '#ff8c5a', label: '热点旅行' },
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

function renderShareCardHtml({ theme, summary, petQuote, highlight, sceneDataUrl, level, levelTitle, level2dImage, shareBgImage }) {
  const themeMeta = SHARE_CARD_THEMES[theme] || SHARE_CARD_THEMES.polar;
  const levelBlock = level2dImage ? `
    <div class="share-card-level">
      <img src="${escapeShareHtml(level2dImage)}" alt="刘看山等级形象">
      <span>Lv.${escapeShareHtml(level || 1)}</span>
    </div>
  ` : '';
  return `
    <div class="share-card" style="background:${themeMeta.background}${shareBgImage ? ` url('${escapeShareHtml(shareBgImage)}') center/cover no-repeat` : ''}">
      <div class="share-card-scene" style="background-image:url('${sceneDataUrl || ''}');background-color:${themeMeta.background}">
        ${levelBlock}
        <div class="share-card-theme">${themeMeta.label}</div>
        ${levelTitle ? `<div class="share-card-level-title">Lv.${escapeShareHtml(level || 1)} · ${escapeShareHtml(levelTitle)}</div>` : ''}
        <div class="share-card-pet-quote">"${escapeShareHtml(petQuote || '看山带回了一份小汇报')}"</div>
      </div>
      <div class="share-card-body">
        <div class="share-card-summary">${escapeShareHtml(summary || '')}</div>
        ${highlight ? `
        <div class="share-card-highlight">
          <div class="share-card-highlight-title">${escapeShareHtml(highlight.title || '')}</div>
          <div class="share-card-highlight-reason">— ${escapeShareHtml(highlight.reason || '')}</div>
        </div>` : ''}
      </div>
      <div class="share-card-footer">
        <span class="share-card-watermark">知乎 · 刘看山虚拟宠物</span>
        <span class="share-card-qr">📱</span>
      </div>
    </div>
  `;
}

function escapeShareHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
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
    highlight: Array.isArray(highlights) && highlights.length ? highlights[0] : null,
    sceneDataUrl,
    level: handbookData.level,
    levelTitle: handbookData.levelTitle,
    level2dImage: handbookData.level2dImage,
    shareBgImage: handbookData.shareBgImage,
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
  root.innerHTML = `
    <div class="share-card leaderboard-share-card"
         style="background:#f4f9ff${payload.shareBgImage ? ` url('${escapeShareHtml(payload.shareBgImage)}') center/cover no-repeat` : ''}">
      <div class="leaderboard-share-visual">
        <img src="${escapeShareHtml(payload.level2dImage || '')}" alt="刘看山等级形象">
      </div>
      <div class="leaderboard-share-copy">
        <small>刘看山等级榜</small>
        <h1>Lv.${escapeShareHtml(payload.level || 1)}</h1>
        <strong>${escapeShareHtml(payload.levelTitle || '宇宙知识探索员')}</strong>
        <p>${escapeShareHtml(payload.slogan || '内容越读，看山越强')}</p>
      </div>
      <div class="share-card-footer">
        <span class="share-card-watermark">知乎 · 刘看山虚拟宠物</span>
        <span class="share-card-qr">↗</span>
      </div>
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
  const overlay = document.createElement('div');
  overlay.className = 'share-card-overlay';
  overlay.innerHTML = `
    <div class="share-card-preview-modal">
      <button class="share-card-close" type="button" aria-label="关闭">×</button>
      <img class="share-card-preview-img" src="${dataUrl}" alt="旅行分享卡预览">
      <div class="share-card-preview-actions">
        <a class="share-card-download-btn" href="${dataUrl}"
           download="liukanshan-${handbookData.theme || 'polar'}-${handbookData.travelId || Date.now()}.png">
          下载图片
        </a>
        <span class="share-card-tip">右键也能直接保存到本地</span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.share-card-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
};
