import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkeletal } from "three/addons/utils/SkeletonUtils.js";

const SHIP_PATH = "/3d-liukanshan-roaming/finale-ship.glb?v=2";
const PET_PATH = "/3d-liukanshan-roaming/liukanshan-slot.glb?v=5";

const cache = { ship: null, pet: null };
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

export async function playFinaleShipEffect(options = {}) {
  if (active) return;
  active = true;

  const duration = Number(options.duration) || 6000;
  const message = options.message || "宇宙知识领航者，归位！";

  // ===== Overlay & banner =====
  const overlay = document.createElement("div");
  overlay.className = "finale-ship-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "1500",
    background:
      "radial-gradient(ellipse at center, rgba(22,40,90,0.88) 0%, rgba(0,8,30,0.98) 70%)",
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
    background: "linear-gradient(135deg, rgba(255,221,108,0.96), rgba(255,165,32,0.94))",
    color: "#3a2200",
    fontSize: "22px",
    fontWeight: "800",
    letterSpacing: "2px",
    boxShadow: "0 18px 48px rgba(255,176,32,0.36), 0 0 0 1px rgba(255,255,255,0.32) inset",
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
  const fill = new THREE.DirectionalLight(0xffe6b3, 1.5);
  fill.position.set(5, 8, 5); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x88c0ff, 0.9);
  rim.position.set(-4, 5, -3); scene.add(rim);

  // ===== Assets =====
  let shipGltf, petGltf;
  try {
    [shipGltf, petGltf] = await Promise.all([
      cache.ship ? Promise.resolve(cache.ship) : loadGLB(SHIP_PATH).then((g) => (cache.ship = g)),
      cache.pet ? Promise.resolve(cache.pet) : loadGLB(PET_PATH).then((g) => (cache.pet = g)),
    ]);
  } catch (err) {
    console.warn("[FinaleShip] asset load failed", err);
    cleanup();
    return;
  }

  // ===== Ship: 左侧合影位 =====
  const ship = shipGltf.scene.clone(true);
  cloneRenderableResources(ship);
  let shipBox = new THREE.Box3().setFromObject(ship);
  const shipSize = shipBox.getSize(new THREE.Vector3());
  const shipBaseScale = 1.7 / Math.max(shipSize.y, 0.001);
  ship.scale.setScalar(shipBaseScale);
  shipBox = new THREE.Box3().setFromObject(ship);
  const shipCenter = shipBox.getCenter(new THREE.Vector3());
  ship.position.set(-shipCenter.x, -shipCenter.y, -shipCenter.z);

  const shipRoot = new THREE.Group();
  shipRoot.add(ship);
  scene.add(shipRoot);

  const SHIP_TARGET_X = -0.8;
  const SHIP_TARGET_Y = 0.15;
  const SHIP_TARGET_Z = -0.4;
  const SHIP_TARGET_ROT_Y = 0.18;        // 船头略朝右
  const SHIP_START_X = 9;
  const SHIP_START_SCALE = 0.28;
  const SHIP_START_TILT = 0.22;

  shipRoot.position.set(SHIP_START_X, SHIP_TARGET_Y, SHIP_TARGET_Z);
  shipRoot.scale.setScalar(SHIP_START_SCALE);
  shipRoot.rotation.y = SHIP_TARGET_ROT_Y + SHIP_START_TILT;

  // ===== Pet: 静态站船右前方 =====
  // 用 SkeletonUtils.clone 避免和首页 roaming-character 共享骨架（骨骼矩阵互相覆写会撑爆 mesh）
  const pet = cloneSkeletal(petGltf.scene);
  fixPetMaterials(pet);
  let petBox = new THREE.Box3().setFromObject(pet);
  const petSize = petBox.getSize(new THREE.Vector3());
  const petScale = 0.7 / Math.max(petSize.y, 0.001);  // 约船高 41%
  pet.scale.setScalar(petScale);
  petBox = new THREE.Box3().setFromObject(pet);
  const petCenter = petBox.getCenter(new THREE.Vector3());
  pet.position.x = -petCenter.x;
  pet.position.y = -petBox.min.y;
  pet.position.z = -petCenter.z;

  const petRoot = new THREE.Group();
  petRoot.add(pet);
  // 船右前方
  const PET_TARGET_X = 1.4;
  const PET_TARGET_Y = -0.85;
  const PET_TARGET_Z = 0.8;
  petRoot.position.set(PET_TARGET_X, PET_TARGET_Y, PET_TARGET_Z);
  petRoot.rotation.y = -0.15;            // 微微朝向船（左前）以呼应合影感
  petRoot.visible = false;               // 等 banner / 船入场后再淡入
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
  const SHIP_PHASE_END = 0.25;   // 船入场结束（默认 6s 下约 1.5s，更利落）
  const PET_FADE_START = 0.28;   // 船快到位时刘看山淡入
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

    // —— 船：入场缓动 → 合影呼吸
    if (t < SHIP_PHASE_END) {
      const k = easeOutCubic(t / SHIP_PHASE_END);
      shipRoot.position.x = SHIP_START_X + (SHIP_TARGET_X - SHIP_START_X) * k;
      shipRoot.position.y = SHIP_TARGET_Y;
      shipRoot.scale.setScalar(SHIP_START_SCALE + (1 - SHIP_START_SCALE) * k);
      shipRoot.rotation.y = SHIP_TARGET_ROT_Y + SHIP_START_TILT * (1 - k);
    } else {
      shipRoot.position.x = SHIP_TARGET_X;
      shipRoot.position.y = SHIP_TARGET_Y + Math.sin(seconds * 1.2) * 0.05;
      shipRoot.scale.setScalar(1);
      shipRoot.rotation.y = SHIP_TARGET_ROT_Y + Math.sin(seconds * 0.6) * 0.04;
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
      disposeObject(shipRoot);
      disposeObject(petRoot);
      renderer.dispose();
      overlay.remove();
      active = false;
    }, 450);
  }

  rafId = requestAnimationFrame(frame);
}

export function isFinaleShipActive() {
  return active;
}
