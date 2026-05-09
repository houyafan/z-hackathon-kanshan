# Legacy Demos

这里收的是 P0 之前 hackathon 起步阶段写的探索文件。当前线上服务（`p0_mock/server.py` + `p0_mock/static/`）已经把它们全部替代，这些文件不再被任何活路由引用，但保留下来当历史参考与 3D 调试沙盘。

## 文件清单

### 3D 模型查看器（独立调试工具）

| 文件 | 用途 |
| --- | --- |
| `index.html` | 拖拽 `.glb` 到浏览器即时查看，用于本地建模迭代 |
| `main.js` | 上面那个 viewer 的 Three.js 代码 |

### 角色溜达 lib 教学 demo

| 文件 | 用途 |
| --- | --- |
| `roaming-demo.html` | 「3D 模型溜达演示」点击页面让模型走过去 |
| `roaming-example.html` | 「溜达角色 API 使用示例」开发参考文档 |
| `simple-roaming.html` | 「简单 3D 溜达演示」最小可跑版 |

这三件套依赖 `../3d-liukanshan-roaming/` 这个仍在用的 lib，跨目录引用已修正。

### 知乎主页 PoC（早期 P0 雏形）

| 文件 | 用途 |
| --- | --- |
| `zhihu-home.html` | 知乎主页 mock + 角色溜达，已被 `p0_mock/static/index.html` 取代 |
| `zhihu-roaming.html` | 与 `zhihu-home.html` 内容完全一致（早期重复文件） |
| `zhihu-final.html` | 上一版本的 PoC（窗口化 Model Container 风格） |

### 资源文件

| 文件 | 大小 | 用途 |
| --- | --- | --- |
| `mobefqrv.png` | 31 MB | Three.js 球面环境贴图，给 `zhihu-*.html` 当反射光源 |
| `mobeohg5.png` | 15 MB | 备选环境贴图 |
| `低面数.glb` | 1.2 MB | 早期低面数刘看山模型，仅给本目录的 demo 用 |

> 当前 P0 服务用的是 `3d-liukanshan-roaming/liukanshan-slot.glb`，与本目录的 `低面数.glb` 不同。
