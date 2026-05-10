# 旅行手账分享卡 README

归档时间：2026-05-10
范围：旅行归来后，把 LLM 生成的手札 summary + pet_quote + highlights 渲染成 9:16 长图，用户可保存/分享
当前状态：已完成（纯前端 html2canvas + Three.js 场景截图）

## 1. 目标

PRD §（一）.B「个人主页挂件...宠物游历相册、旅行手账合集，支持社交展示」+ 黑客松 demo 故事链「带回内容 → 朋友圈分享」延伸。

效果：旅行归来 → 手账打开 → 点「分享这次旅行」按钮 → 弹出 9:16 预览图 → 用户右键保存或一键下载。

```text
旅行手册 LLM ready
-> 用户点「分享这次旅行」按钮
-> 前端 character.captureSceneSnapshot(theme) 拿 Three.js 一帧
-> 写入隐藏的 .share-card 容器（750×1280）
-> html2canvas 截图为 base64 PNG
-> 弹出预览模态 + 下载按钮
```

## 2. 卡片视觉构成

9:16 长图，分四段：

| 区段 | 高度占比 | 内容 |
| --- | --- | --- |
| 主题场景图 | 60% | Three.js 渲染一帧 + 主题色叠加（极地 #0b1730 / 热点 #3a0a0e）+ 主题标签 + pet_quote |
| 摘要 | 25% | LLM 生成的 summary（80-160 字，半透明白色叠层） |
| 1 条 highlight | 10% | `llm_highlights[0]` 的 title + reason |
| 水印 | 5% | 知乎 · 刘看山虚拟宠物 + 二维码占位 |

## 3. 实现要点

### 3a. Three.js renderer 必须开 preserveDrawingBuffer

文件：`3d-liukanshan-roaming/roaming-character.js`

```javascript
this.renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true, // 关键，否则 toDataURL 是黑屏
});
```

性能影响 <2%，对所有用户启用。

### 3b. captureSceneSnapshot 公开方法

```javascript
captureSceneSnapshot(themeOverrides = {}) {
  if (!this.renderer || !this.scene || !this.camera) return null;
  const prevBg = this.scene.background;
  const prevClearColor = this.renderer.getClearColor(new THREE.Color()).getHex();
  const prevClearAlpha = this.renderer.getClearAlpha();
  try {
    if (themeOverrides.background) {
      this.scene.background = new THREE.Color(themeOverrides.background);
      this.renderer.setClearColor(themeOverrides.background, 1);
    }
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  } finally {
    // 恢复原状，否则用户后续看到的 character 会变成主题色
    this.scene.background = prevBg;
    this.renderer.setClearColor(prevClearColor, prevClearAlpha);
    this.renderer.render(this.scene, this.camera);
  }
}
```

调用：`window.character.captureSceneSnapshot({ background: '#0b1730' })`。

### 3c. share_card.js 主流程

文件：`p0_mock/static/share_card.js`

```javascript
window.generateTravelShareCard = async function (handbookData) {
  const sceneDataUrl = window.character?.captureSceneSnapshot?.({...}) || null;
  // 渲染 9:16 隐藏 DOM
  document.getElementById('shareCardRoot').innerHTML = renderShareCardHtml({...});
  await new Promise(r => requestAnimationFrame(r));
  // html2canvas 截图
  const canvas = await html2canvas(root.querySelector('.share-card'), {
    backgroundColor: null,
    width: 750,
    height: 1280,
    scale: 2,
    useCORS: true,
  });
  return canvas.toDataURL('image/png');
};
```

### 3d. 入口 + 预览模态

`p0_mock/static/app.js` 的 `renderTravelHandbookEntry` 在每条手册卡片底部追加：

```html
<button class="handbook-share-btn"
        data-share-handbook='{json}'
        ${llmReady ? '' : 'disabled'}>
  ${llmReady ? '分享这次旅行' : '等看山写完再分享～'}
</button>
```

点击 → `window.openShareCardPreview(data)` → 弹 `.share-card-overlay` 预览 + 下载链接。

## 4. 数据来源

直接从 `GET /api/p1/travel/handbook` 已有响应取，无新接口：
- `entry.coverStyle` → 主题色
- `entry.travelId` → 文件名
- `entry.llmSummary` / `llmPetQuote` / `llmHighlights[0]` → 文字内容

未生成（LLM 未 ready）的手册分享按钮 disabled。

## 5. 已知限制

| 限制 | 影响 | 缓解 |
| --- | --- | --- |
| html2canvas 不支持 backdrop-filter | 毛玻璃效果在导出图丢失 | 已改用静态 `rgba(255,255,255,0.12)` 叠层 |
| 老 IE / 不支持 html2canvas 的浏览器 | 无导出图 | 兜底 toast「截图组件未加载，请右键保存预览图」 |
| 截图分辨率过高内存爆炸 | 设备 OOM | 容器固定 750×1280，scale=2 限制最高 1500×2560 |
| Three.js 模型未加载完时点分享 | 场景图为空背景色 | 渲染照样进行，只是没有 character 形象（视觉降级） |

## 6. 接入要点

无后端改动，纯前端。
依赖：`html2canvas@1.4.1`（CDN，已在 `index.html` 加载，失败时会设 `window.__html2canvasFailed=true`）。

如果将来要切到服务端渲染（PIL/Pillow 或 SSR）：
1. 新增 `GET /api/p1/travel/handbook/{travelId}/share-payload` 返回结构化数据
2. 服务端用模板引擎渲染 SVG/PNG 后返回
3. 前端改为 `<img src="...">` 直接展示

当前方案的优势：零依赖、零服务端负担、IP 一致性自然（直接拿同一个 character 实例）。

## 7. 验收标准

| 场景 | 预期 |
| --- | --- |
| 旅行归来后手册展示 LLM 总结 | summary + pet_quote + 3-5 highlights |
| 点「分享这次旅行」按钮 | 1-2s 内弹出预览图，含 3D 主题图 + summary + 1 highlight |
| 保存图片 | 文件名 `liukanshan-{theme}-{travelId}.png`，720×1280 |
| LLM 未 ready 时点分享 | 按钮 disabled + 提示「等看山写完再分享～」 |
| html2canvas 加载失败 | toast 提示，无 JS 报错 |
| 关闭预览 | 模态消失，character 视觉无残留主题色 |
