import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkeletal } from "three/addons/utils/SkeletonUtils.js";

const PET_PATH = "/3d-liukanshan-roaming/liukanshan-slot.glb?v=5";

// 各阶段的"合影式"升级动画配置。
// 视觉模板照搬 finale-ship：物件从右侧滑入站位 + 看山在右前方淡入合影 + 顶部 banner。
// 不同阶段只换 glb / banner 配色 / 默认文案，缩放/镜头维持一致。
const STAGES = {
  iceberg: {
    label: "iceberg",
    modelPath: "/3d-liukanshan-roaming/iceberg.glb?v=1",
    // 冰山 bbox 又扁又宽，按 targetHeight 缩放会让深度膨胀吞掉 pet。
    // 改用 maxAxis 缩放：把"最长轴"压到 5.0m，让冰山有气派；
    // hero 后推到 z=-2.0（远景）、pet 前推到 z=1.2，前后留出 0.7m 净距避免互相穿插，
    // 但 pet 不再凑得过近，避免透视下 pet 占满半屏。
    targetMaxSize: 5.0,
    heroPos: { x: -0.9, y: 0.15, z: -2.0 },
    petPos: { x: 1.6, y: -0.85, z: 1.2 },
    defaultMessage: "看山升级啦！",
    bannerGradient: "linear-gradient(135deg, rgba(170,224,255,0.96), rgba(108,168,232,0.94))",
    bannerColor: "#0a2a4a",
    bannerShadow: "0 18px 48px rgba(108,168,232,0.42), 0 0 0 1px rgba(255,255,255,0.36) inset",
    overlayBg: "radial-gradient(ellipse at center, rgba(28,68,120,0.88) 0%, rgba(2,10,30,0.98) 70%)",
    rimColor: 0xaad8ff,
    fillColor: 0xffffff,
  },
  tree: {
    label: "tree",
    modelPath: "/3d-liukanshan-roaming/christmas-tree.glb?v=1",
    targetHeight: 1.9,
    defaultMessage: "看山升级啦！",
    bannerGradient: "linear-gradient(135deg, rgba(255,210,148,0.96), rgba(232,90,76,0.94))",
    bannerColor: "#3a1408",
    bannerShadow: "0 18px 48px rgba(232,90,76,0.36), 0 0 0 1px rgba(255,255,255,0.32) inset",
    overlayBg: "radial-gradient(ellipse at center, rgba(36,72,42,0.9) 0%, rgba(6,18,8,0.98) 70%)",
    rimColor: 0xffd089,
    fillColor: 0xfff2c4,
  },
  hut: {
    label: "hut",
    modelPath: "/3d-liukanshan-roaming/hut.glb?v=1",
    targetHeight: 1.7,
    defaultMessage: "看山升级啦！",
    bannerGradient: "linear-gradient(135deg, rgba(255,221,176,0.96), rgba(214,156,96,0.94))",
    bannerColor: "#3a2110",
    bannerShadow: "0 18px 48px rgba(214,156,96,0.36), 0 0 0 1px rgba(255,255,255,0.32) inset",
    overlayBg: "radial-gradient(ellipse at center, rgba(68,48,30,0.88) 0%, rgba(16,10,6,0.98) 70%)",
    rimColor: 0xffd9a3,
    fillColor: 0xffe9c4,
  },
  ship: {
    label: "ship",
    modelPath: "/3d-liukanshan-roaming/finale-ship.glb?v=2",
    targetHeight: 1.7,
    defaultMessage: "宇宙知识领航者，归位！",
    bannerGradient: "linear-gradient(135deg, rgba(255,221,108,0.96), rgba(255,165,32,0.94))",
    bannerColor: "#3a2200",
    bannerShadow: "0 18px 48px rgba(255,176,32,0.36), 0 0 0 1px rgba(255,255,255,0.32) inset",
    overlayBg: "radial-gradient(ellipse at center, rgba(22,40,90,0.88) 0%, rgba(0,8,30,0.98) 70%)",
    rimColor: 0x88c0ff,
    fillColor: 0xffe6b3,
  },
};

// Lv → stage 路由：1-3 冰山 / 4-6 圣诞树 / 7-9 小屋 / 10 海盗船。
export function stageForLevel(level) {
  const lv = Number(level) || 0;
  if (lv >= 10) return "ship";
  if (lv >= 7) return "hut";
  if (lv >= 4) return "tree";
  return "iceberg";
}

const cache = { pet: null }; // 模型缓存：pet + 各 stage 的 glb 各占一项
let active = false;

function loadGLB(path) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(path, resolve, undefined, reject);
  });
}

function cloneRenderableResources(root) {
  root.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    if (child.geometry) child.geometry = child.geometry.clone();
    if (Array.isArray(child.material)) {
      child.material = child.material.map((m) => m?.clone?.() || m);
    } else if (child.material?.clone) {
      child.material = child.material.clone();
    }
  });
}

// 刘看山 glb 的材质默认 alphaMode=BLEND + depthWrite=false，跨自身时深度排序错乱
// 会看到"透过身体看到背后"。改成 alphaTest=0.5 的 mask 模式：
// alpha<0.5 丢弃像素、保留贴图边缘抠图，>=0.5 完全不透明 + 写深度，从而消除透视。
function fixPetMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh && !child.isSkinnedMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!m) continue;
      m.transparent = false;
      m.alphaTest = 0.5;
      m.depthWrite = true;
      m.side = THREE.FrontSide;
      m.needsUpdate = true;
    }
  });
}

function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

// 通用升级动效。stage 选择哪个阶段配置；options 可覆盖 message / duration。
export async function playLevelStageEffect(stage, options = {}) {
  const cfg = STAGES[stage] || STAGES.ship;
  if (active) return;
  active = true;

  const duration = Number(options.duration) || 6000;
  const message = options.message || cfg.defaultMessage;

  // ===== Overlay & banner =====
  const overlay = document.createElement("div");
  overlay.className = `finale-ship-overlay stage-${cfg.label}`;
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "1500",
    background: cfg.overlayBg,
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 0.4s ease",
  });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { overlay.style.opacity = "1"; });

  const banner = document.createElement("div");
  Object.assign(banner.style, {
    position: "absolute",
    top: "10%",
    left: "50%",
    transform: "translate(-50%, 0) scale(0.92)",
    padding: "16px 30px",
    borderRadius: "999px",
    background: cfg.bannerGradient,
    color: cfg.bannerColor,
    fontSize: "22px",
    fontWeight: "800",
    letterSpacing: "2px",
    boxShadow: cfg.bannerShadow,
    opacity: "0",
    transition: "opacity 0.4s ease, transform 0.4s cubic-bezier(.34,1.56,.64,1)",
  });
  banner.textContent = message;
  overlay.appendChild(banner);

  // ===== Canvas / renderer =====
  const w = window.innerWidth;
  const h = window.innerHeight;
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { display: "block", width: "100%", height: "100%" });
  overlay.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 1000);
  camera.position.set(0, 1.0, 6.8);
  camera.lookAt(0, 0.2, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const fill = new THREE.DirectionalLight(cfg.fillColor, 1.5);
  fill.position.set(5, 8, 5); scene.add(fill);
  const rim = new THREE.DirectionalLight(cfg.rimColor, 0.9);
  rim.position.set(-4, 5, -3); scene.add(rim);

  // ===== Assets =====
  let stageGltf, petGltf;
  try {
    [stageGltf, petGltf] = await Promise.all([
      cache[cfg.label]
        ? Promise.resolve(cache[cfg.label])
        : loadGLB(cfg.modelPath).then((g) => (cache[cfg.label] = g)),
      cache.pet ? Promise.resolve(cache.pet) : loadGLB(PET_PATH).then((g) => (cache.pet = g)),
    ]);
  } catch (err) {
    console.warn(`[LevelStage:${cfg.label}] asset load failed`, err);
    cleanup();
    return;
  }

  // ===== 阶段主体：左侧合影位 =====
  const hero = stageGltf.scene.clone(true);
  cloneRenderableResources(hero);
  let heroBox = new THREE.Box3().setFromObject(hero);
  const heroSize = heroBox.getSize(new THREE.Vector3());
  // 缩放策略：默认按高度对齐到 targetHeight；
  // 若 stage 配了 targetMaxSize（用于很扁/很宽的模型），改成把"最长轴"压到这个尺寸，
  // 避免扁平模型按高度对齐时深度方向膨胀。
  const heroBaseScale = cfg.targetMaxSize
    ? cfg.targetMaxSize / Math.max(heroSize.x, heroSize.y, heroSize.z, 0.001)
    : cfg.targetHeight / Math.max(heroSize.y, 0.001);
  hero.scale.setScalar(heroBaseScale);
  heroBox = new THREE.Box3().setFromObject(hero);
  const heroCenter = heroBox.getCenter(new THREE.Vector3());
  hero.position.set(-heroCenter.x, -heroCenter.y, -heroCenter.z);

  const heroRoot = new THREE.Group();
  heroRoot.add(hero);
  scene.add(heroRoot);

  const HERO_TARGET_X = cfg.heroPos?.x ?? -0.8;
  const HERO_TARGET_Y = cfg.heroPos?.y ?? 0.15;
  const HERO_TARGET_Z = cfg.heroPos?.z ?? -0.4;
  const HERO_TARGET_ROT_Y = 0.18;       // 略朝右，让出 pet 站位
  const HERO_START_X = 9;
  const HERO_START_SCALE = 0.28;
  const HERO_START_TILT = 0.22;

  heroRoot.position.set(HERO_START_X, HERO_TARGET_Y, HERO_TARGET_Z);
  heroRoot.scale.setScalar(HERO_START_SCALE);
  heroRoot.rotation.y = HERO_TARGET_ROT_Y + HERO_START_TILT;

  // ===== Pet: 静态站主体右前方 =====
  // 用 SkeletonUtils.clone 避免和首页 roaming-character 共享骨架（骨骼矩阵互相覆写会撑爆 mesh）
  const pet = cloneSkeletal(petGltf.scene);
  fixPetMaterials(pet);
  let petBox = new THREE.Box3().setFromObject(pet);
  const petSize = petBox.getSize(new THREE.Vector3());
  const petScale = 0.7 / Math.max(petSize.y, 0.001);  // 约主体高 41%
  pet.scale.setScalar(petScale);
  petBox = new THREE.Box3().setFromObject(pet);
  const petCenter = petBox.getCenter(new THREE.Vector3());
  pet.position.x = -petCenter.x;
  pet.position.y = -petBox.min.y;
  pet.position.z = -petCenter.z;

  const petRoot = new THREE.Group();
  petRoot.add(pet);
  const PET_TARGET_X = cfg.petPos?.x ?? 1.4;
  const PET_TARGET_Y = cfg.petPos?.y ?? -0.85;
  const PET_TARGET_Z = cfg.petPos?.z ?? 0.8;
  petRoot.position.set(PET_TARGET_X, PET_TARGET_Y, PET_TARGET_Z);
  petRoot.rotation.y = -0.15;            // 微微朝向主体（左前）以呼应合影感
  petRoot.visible = false;               // 等 banner / 主体入场后再淡入
  scene.add(petRoot);

  // 仅用 Idle 动画（不再 Running / Alert，因为不跑了）
  const idleClip = petGltf.animations.find((c) => /idle/i.test(c.name || ""))
    || petGltf.animations[0];
  const petMixer = new THREE.AnimationMixer(pet);
  if (idleClip) {
    const action = petMixer.clipAction(idleClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
  }

  // ===== 时间轴 =====
  const HERO_PHASE_END = 0.25;   // 主体入场结束（默认 6s 下约 1.5s，更利落）
  const PET_FADE_START = 0.28;   // 主体快到位时刘看山淡入
  const PET_FADE_END   = 0.48;

  const start = performance.now();
  const clock = new THREE.Clock();
  let rafId = 0;
  let cleanedUp = false;

  function frame() {
    if (cleanedUp) return;
    const now = performance.now();
    const elapsed = now - start;
    const t = Math.min(1, elapsed / duration);
    const seconds = elapsed / 1000;

    petMixer.update(clock.getDelta());

    // —— 主体：入场缓动 → 合影呼吸
    if (t < HERO_PHASE_END) {
      const k = easeOutCubic(t / HERO_PHASE_END);
      heroRoot.position.x = HERO_START_X + (HERO_TARGET_X - HERO_START_X) * k;
      heroRoot.position.y = HERO_TARGET_Y;
      heroRoot.scale.setScalar(HERO_START_SCALE + (1 - HERO_START_SCALE) * k);
      heroRoot.rotation.y = HERO_TARGET_ROT_Y + HERO_START_TILT * (1 - k);
    } else {
      heroRoot.position.x = HERO_TARGET_X;
      heroRoot.position.y = HERO_TARGET_Y + Math.sin(seconds * 1.2) * 0.05;
      heroRoot.scale.setScalar(1);
      heroRoot.rotation.y = HERO_TARGET_ROT_Y + Math.sin(seconds * 0.6) * 0.04;
    }

    // —— 刘看山：在原位淡入 + 上浮一点 + idle 呼吸
    if (t < PET_FADE_START) {
      petRoot.visible = false;
    } else {
      petRoot.visible = true;
      const k = Math.min(1, (t - PET_FADE_START) / (PET_FADE_END - PET_FADE_START));
      const ease = easeOutCubic(k);
      // 缩放从 0.85→1 做一个"出现"的弹性
      const s = 0.85 + 0.15 * ease;
      petRoot.scale.setScalar(s);
      // 微微往上漂浮
      petRoot.position.y = PET_TARGET_Y - 0.15 * (1 - ease)
        + (k >= 1 ? Math.sin(seconds * 1.6 + 0.5) * 0.03 : 0);
    }

    if (t >= 0.05) {
      banner.style.opacity = "1";
      banner.style.transform = "translate(-50%, 0) scale(1)";
    }

    renderer.render(scene, camera);

    if (t < 1) {
      rafId = requestAnimationFrame(frame);
    } else {
      window.setTimeout(cleanup, 600);
    }
  }

  function disposeObject(obj) {
    obj.traverse((node) => {
      if (node.geometry) node.geometry.dispose?.();
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => {
        if (!m) return;
        for (const key of Object.keys(m)) {
          const val = m[key];
          if (val && val.isTexture) val.dispose?.();
        }
        m.dispose?.();
      });
    });
  }

  function onResize() {
    const nw = window.innerWidth;
    const nh = window.innerHeight;
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
  }
  window.addEventListener("resize", onResize);

  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    window.removeEventListener("resize", onResize);
    overlay.style.opacity = "0";
    window.setTimeout(() => {
      cancelAnimationFrame(rafId);
      disposeObject(heroRoot);
      disposeObject(petRoot);
      renderer.dispose();
      overlay.remove();
      active = false;
    }, 450);
  }

  rafId = requestAnimationFrame(frame);
}

// 向后兼容：旧的 finale-ship 调用直接转发到 ship 阶段。
export async function playFinaleShipEffect(options = {}) {
  return playLevelStageEffect("ship", options);
}

export function isFinaleShipActive() {
  return active;
}
