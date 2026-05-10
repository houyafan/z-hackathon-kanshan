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

function renderShareCardHtml({ theme, summary, petQuote, highlight, sceneDataUrl }) {
  const themeMeta = SHARE_CARD_THEMES[theme] || SHARE_CARD_THEMES.polar;
  return `
    <div class="share-card" style="background:${themeMeta.background}">
      <div class="share-card-scene" style="background-image:url('${sceneDataUrl || ''}');background-color:${themeMeta.background}">
        <div class="share-card-theme">${themeMeta.label}</div>
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
