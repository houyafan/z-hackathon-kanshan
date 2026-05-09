---
name: 3d-liukanshan-roaming
description: >-
  Wires a Three.js roaming 3D mascot (Liu Kan Shan) with setMessage, moveTo, and moveToElement. Apply when the user migrates the component, needs bubble text or programmatic movement, or points to 3d-liukanshan-roaming assets.
---

# 3D 刘看山溜达角色（项目技能入口）

**完整说明与可迁移资源**在仓库内目录 **`3d-liukanshan-roaming/`**：

- `SKILL.md`：主文档（API、配置、接入步骤）
- `roaming-character.js` / `roaming-character.css` / `低面数.glb`
- `roaming-example.html`：示例页

在 Cursor 中应优先阅读 **`3d-liukanshan-roaming/SKILL.md`** 获取完整内容；本文件仅作技能发现与路径索引。

**要点**：气泡文案由 `setMessage` 与 `moveTo(..., { message })` 外部传入；移动由 `moveTo` / `moveToElement` 触发，默认 `enableClickMove: false` 不响应整页点击。
