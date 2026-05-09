---
name: 3d-liukanshan-roaming
description: Integrates a Three.js roaming 3D character (Liu Kan Shan) with API-driven movement and bubble text; load this skill when the user needs migration steps, setMessage/setMove, or the packaged assets under 3d-liukanshan-roaming/.
---

# 3D 刘看山溜达角色

本目录为**可整包迁移**的接入单元：同目录下放置 `SKILL.md`（本文档）、`roaming-character.js`、`roaming-character.css`、默认模型 `低面数.glb` 与示例 `roaming-example.html`。

> **命名说明**：`SKILL.md` 为 Cursor 推荐的技能主文档文件名；旧名 `3D-LiuKanShan-SKills.md` 已弃用，请以本文件为准。

## 目录与文件

| 文件 | 说明 |
|------|------|
| `SKILL.md` | 接入说明与 API（本文件） |
| `roaming-character.js` | 核心类 `RoamingCharacter`、导出 `initRoamingCharacter` |
| `roaming-character.css` | 角色容器、气泡、阴影、引导条样式 |
| `liukanshan.glb` | 默认 3D 模型（可替换，并同步修改 `modelPath`） |
| `roaming-example.html` | 在包内同路径下的联调示例（本地需 HTTP 服务，勿 `file://` 直接开 GLB） |

## 快速开始

### 1. 引入

```html
<link rel="stylesheet" href="3d-liukanshan-roaming/roaming-character.css">

<script type="importmap">
{
    "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    }
}
</script>
```

若整包放站点根下本目录，静态路径保持 `3d-liukanshan-roaming/` 前缀；若你改成别的目录，下文路径一并替换。

### 2. HTML 结构

```html
<div class="roaming-character" id="roamingCharacter">
    <div class="speech-bubble" id="speechBubble">等待指令~</div>
    <canvas class="character-canvas" id="characterCanvas"></canvas>
    <div class="character-shadow" id="characterShadow"></div>
</div>

<div class="instruction" id="instruction" style="display: none;">提示文案（可选）</div>
```

### 3. 初始化

```html
<script type="module">
    import { initRoamingCharacter } from '3d-liukanshan-roaming/roaming-character.js';

    const character = initRoamingCharacter({
        modelPath: '3d-liukanshan-roaming/低面数.glb',
        idleMessage: '等待指令~',
        enableClickMove: false
    });
</script>
```

`enableClickMove: false` 时，**不**用点击触发位移，只通过 `moveTo` / `moveToElement` 由业务调用。

## 核心 API

### `setMessage(text, options?)`

- `text`：气泡文案，由**外部**传入，表达当前工具/业务状态。
- `options.autoHide`：毫秒，到时恢复为 `idleMessage`。

```javascript
character.setMessage('正在处理…', { autoHide: 2000 });
```

### `moveTo(x, y, options?)`

- `x, y`：视口内像素坐标（`clientX` / `clientY` 同系）。
- `options.message`：移动过程中气泡文案（仍由外部传入时最有意义）。
- `options.useRandomMessage`：未传 `message` 时是否用内置随机句；`false` 且无语义上的 `message` 则不强行改气泡。

```javascript
character.moveTo(400, 300, { message: '我过来了' });
character.moveTo(200, 200, { useRandomMessage: false });
```

### `moveToElement(element, options?)`

将角色中心移向 `element.getBoundingClientRect()` 中心，`options` 同 `moveTo`。

### `getPosition()` / `isMovingStatus()`

返回 `{ x, y }` 与是否仍在移动，便于串联引导流程。

## 初始化配置

| 配置项 | 类型 | 默认 | 说明 |
|--------|------|------|------|
| `containerId` | string | `roamingCharacter` | 外层容器 `id` |
| `modelPath` | string | 见上 | glb 路径，相对当前页 |
| `width` / `height` | number | 130 / 150 | 画布里 CSS 像素 |
| `scale` | number | 1.3 | 归一化后缩放 |
| `speed` | number | 250 | 平移速度 |
| `messages` | string[] | 内置多句 | `moveTo` 随机用 |
| `idleMessage` | string | 见类内默认 | 闲时气泡 |
| `arrivedMessage` | string | 见类内默认 | 到达时气泡（随后可恢复 `idle`） |
| `enableClickMove` | boolean | `false` | 是否允许点击整页移动 |

## 与业务集成要点

1. **气泡**一律视为「对外展示能力」：用 `setMessage` 和 `moveTo(…, { message })` 从外部传入，不要写死在包内（默认文案仅作首次演示）。
2. **位移**在多数产品场景下应由业务调用 `moveTo` / `moveToElement`，并保持 `enableClickMove: false`，避免与页面其他点击冲突。
3. 本地联调请用 `python3 -m http.server` 等，避免跨域/本地文件限制导致 glb 加载失败。

## 文件清单（迁移时一并拷贝）

- `roaming-character.js`
- `roaming-character.css`
- `低面数.glb`（或自研模型 + 改 `modelPath`）
- `roaming-example.html`（可选）
- `SKILL.md`（本说明）

## 更新日志

- v1.1：规范 `SKILL.md` 命名与 Cursor frontmatter；资源收敛到 `3d-liukanshan-roaming/`；修复点击排除逻辑（`#id` 选择器）。
- v1.0：3D 渲染、气泡、API、`enableClickMove`。
