import { initRoamingCharacter } from "/3d-liukanshan-roaming/roaming-character.js?v=32";

const app = document.getElementById("app");
const toast = document.getElementById("toast");

let currentUser = null;
let profile = null;
let travelState = null;
let character = null;
let feedItems = [];
let modelPreloadPromise = null;
let noticeTimer = null;
let noticeRemaining = 0;
let idleBandVisible = true;
const savedRewardWalk = localStorage.getItem("liukanshan_reward_walk_enabled") ?? localStorage.getItem("liukanshan_level_walk_enabled");
let rewardWalkEnabled = savedRewardWalk !== "0";
const MODEL_PATH = "/3d-liukanshan-roaming/liukanshan-slot.glb?v=2";

function effectLayer() {
  let layer = document.querySelector(".pet-effect-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "pet-effect-layer";
    document.body.appendChild(layer);
  }
  return layer;
}

function removeAfter(element, ms) {
  window.setTimeout(() => element.remove(), ms);
}

function characterElement() {
  return document.getElementById("roamingCharacter");
}

function characterCenter() {
  const element = characterElement();
  if (!element) return { x: window.innerWidth - 110, y: window.innerHeight - 120 };
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function pulseCharacter(className, duration = 1400) {
  const element = characterElement();
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), duration);
}

function spawnSparks(x, y, options = {}) {
  const layer = effectLayer();
  const count = options.count || 10;
  for (let i = 0; i < count; i++) {
    const spark = document.createElement("i");
    spark.className = `pet-spark ${options.warm ? "warm" : ""}`;
    const angle = (Math.PI * 2 * i) / count;
    const distance = 34 + Math.random() * 36;
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    spark.style.setProperty("--spark-x", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--spark-y", `${Math.sin(angle) * distance - 12}px`);
    layer.appendChild(spark);
    removeAfter(spark, 950);
  }
}

function spawnRing(x, y, level = false) {
  const ring = document.createElement("i");
  ring.className = `pet-ring ${level ? "level" : ""}`;
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  effectLayer().appendChild(ring);
  removeAfter(ring, 900);
}

function spawnFloatChip(text, x, y, level = false) {
  const chip = document.createElement("div");
  chip.className = `pet-float-chip ${level ? "level" : ""}`;
  chip.textContent = text;
  chip.style.left = `${x}px`;
  chip.style.top = `${y}px`;
  effectLayer().appendChild(chip);
  removeAfter(chip, 1500);
}

function playHomecomingEffect() {
  const layer = effectLayer();
  const card = document.createElement("div");
  card.className = "pet-home-card";
  card.innerHTML = "<strong>刘看山到家啦</strong><span>从今天开始，它会陪你一起读好内容</span>";
  layer.appendChild(card);
  removeAfter(card, 3200);

  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight * 0.58;
  character?.setPosition(centerX, centerY);
  character?.playSpawnEffect({
    message: "我回家啦，以后一起看知乎~",
    duration: 3400,
    particleCount: 156,
    scaleMultiplier: 1.34,
  });
  pulseCharacter("pet-homecoming", 3600);
  spawnSparks(centerX, centerY, { count: 18 });
  spawnRing(centerX, centerY, false);

  window.setTimeout(() => {
    character?.moveTo(window.innerWidth - 150, window.innerHeight - 200, {
      message: `Lv.${profile.level} ${stageText(profile.stage)}`,
      useRandomMessage: false,
    });
  }, 3900);
}

function rewardText(reward) {
  const parts = [];
  if (reward.exp) parts.push(`经验 +${reward.exp}`);
  if (reward.satiety) parts.push(`饱食度 +${reward.satiety}`);
  if (reward.mood) parts.push(`心情 +${reward.mood}`);
  if (reward.travelEnergy) parts.push(`精力 +${reward.travelEnergy}`);
  return parts.join("，");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function isLocalDebugHost() {
  return ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
}

function waitForCharacterReady(timeout = 1800) {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (character?.modelReady || character) {
        resolve(character);
        return;
      }
      if (performance.now() - startedAt > timeout) {
        resolve(character);
        return;
      }
      window.requestAnimationFrame(tick);
    };
    tick();
  });
}

async function ensureEffectCharacter() {
  if (!profile) {
    await loadProfile();
  }
  if (!profile?.adopted) {
    const data = await api("/api/p0/pet/adopt", {
      method: "POST",
      body: JSON.stringify({ petName: "刘看山" }),
    });
    profile = data.profile;
  }
  syncCharacter();
  await waitForCharacterReady();
  return character;
}

function centerCharacterForTest() {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight * 0.58;
  character?.setPosition?.(centerX, centerY);
  return { x: centerX, y: centerY };
}

async function runEffectTest(action) {
  const pet = await ensureEffectCharacter();
  if (!pet) {
    showToast("刘看山还没初始化完成");
    return;
  }

  if (action === "center") {
    centerCharacterForTest();
    pet.setMessage("我在这里~😆", { autoHide: 1800 });
    showToast("已移动到舞台中心");
    return;
  }

  if (action === "spawn") {
    centerCharacterForTest();
    pet.playSpawnEffect?.({
      message: "我回家啦，以后一起看知乎~",
      duration: 3400,
      particleCount: 156,
      scaleMultiplier: 1.34,
    });
    pulseCharacter("pet-homecoming", 3600);
    showToast("触发领养出场");
    return;
  }

  if (action === "evolve") {
    centerCharacterForTest();
    pet.playEvolveEffect?.({ message: "看山升级啦！✨", autoHide: 3900 });
    pulseCharacter("pet-level-up", 1800);
    showToast("触发升级进化");
    return;
  }

  if (action === "teleport") {
    pet.setPosition?.(window.innerWidth - 150, window.innerHeight - 200);
    window.setTimeout(() => {
      pet.moveTo(180, window.innerHeight * 0.5, {
        message: "咻，瞬移！",
        useRandomMessage: false,
      });
    }, 80);
    showToast("触发远距离瞬移");
    return;
  }

  if (action === "exp") {
    centerCharacterForTest();
    pet.setMessage("经验 +10，心情 +3 🥰", { autoHide: 2600 });
    pulseCharacter("pet-exp-gain", 1100);
    const center = characterCenter();
    spawnRing(center.x, center.y, false);
    spawnSparks(center.x, center.y, { count: 12 });
    spawnFloatChip("经验 +10", center.x - 34, center.y - 26, false);
    showToast("触发经验获得");
    return;
  }

  if (action === "bubble") {
    centerCharacterForTest();
    pet.setMessage("哈喽～🥰", { autoHide: 3000 });
    showToast("触发 3D 气泡");
    return;
  }

  if (action === "emoji") {
    centerCharacterForTest();
    pet.setMessage("😆", { autoHide: 2600 });
    showToast("触发 Emoji 气泡");
    return;
  }

  if (action === "wave") {
    centerCharacterForTest();
    const started = pet.startWave?.({ message: "拜拜~👋", autoHide: 1500 });
    showToast(started ? "触发挥手告别" : "右手骨骼还没准备好");
    return;
  }

  if (action === "travel-go") {
    centerCharacterForTest();
    pet.startGoTravel?.({ message: "出发旅行！", autoHide: 2200 });
    showToast("触发旅行出发");
    return;
  }

  if (action === "travel-back") {
    centerCharacterForTest();
    pet.startBackHome?.({ message: "旅行回来啦！", autoHide: 2600 });
    showToast("触发旅行归来");
    return;
  }

  if (action === "ring-toggle") {
    idleBandVisible = !idleBandVisible;
    if (idleBandVisible) {
      pet.showIdleRingBand?.();
      showToast("待机光带已开启");
    } else {
      pet.hideIdleRingBand?.();
      showToast("待机光带已关闭");
    }
    return;
  }

  if (action === "home") {
    pet.setPosition?.(window.innerWidth - 150, window.innerHeight - 200);
    pet.setMessage(`Lv.${profile.level} ${stageText(profile.stage)}`, { autoHide: 1800 });
    showToast("已回到右下角");
  }
}

function renderEffectTestPanel() {
  const panel = document.getElementById("effectTestPanel");
  if (!panel || !isLocalDebugHost()) return;
  panel.hidden = false;
  panel.innerHTML = `
    <div class="effect-test-head">
      <strong>特效测试</strong>
      <span>local</span>
    </div>
    <div class="effect-test-grid">
      <button data-effect-test="center">居中</button>
      <button data-effect-test="spawn">领养出场</button>
      <button data-effect-test="evolve">升级进化</button>
      <button data-effect-test="teleport">瞬移残影</button>
      <button data-effect-test="exp">经验获得</button>
      <button data-effect-test="bubble">文字气泡</button>
      <button data-effect-test="emoji">Emoji</button>
      <button data-effect-test="wave">挥手</button>
      <button data-effect-test="travel-go">旅行出发</button>
      <button data-effect-test="travel-back">旅行归来</button>
      <button data-effect-test="ring-toggle">光带开关</button>
      <button data-effect-test="home">回右下角</button>
    </div>
  `;
  panel.querySelectorAll("[data-effect-test]").forEach((button) => {
    button.addEventListener("click", () => runEffectTest(button.dataset.effectTest));
  });
}

function stageText(stage) {
  return {
    cub: "幼崽期",
    growing: "成长期",
    adult: "成年期",
    advanced: "进阶形态",
  }[stage] || stage || "-";
}

function travelStatusText(status) {
  return {
    home: "留守",
    traveling: "游历中",
    returned: "已归来",
    cooldown: "冷却中",
    sleeping: "休眠",
  }[status] || status || "留守";
}

function travelThemeText(theme) {
  return {
    arctic: "北极远行",
    mountain: "山海漫游",
  }[theme] || theme || "游历";
}

function formatCountdown(target) {
  const time = target ? new Date(target).getTime() : 0;
  const diff = Math.max(0, time - Date.now());
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.ceil((diff % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function renderParagraphs(value = "") {
  return String(value)
    .replace(/\\n/g, "\n")
    .split("\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`)
    .join("");
}

function mergeUpdatedContent(content) {
  if (!content) return;
  feedItems = feedItems.map((item) => (item.id === content.id ? { ...item, ...content } : item));
}

function bindPetHoverCard() {
  const bindOnce = (selector, bind) => {
    document.querySelectorAll(selector).forEach((element) => {
      if (element.dataset.petBound) return;
      element.dataset.petBound = "1";
      bind(element);
    });
  };

  bindOnce("[data-hover-travel-start]", (button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      startTravel();
    });
  });
  bindOnce("[data-hover-travel-return]", (button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      completeTravel(true);
    });
  });
  bindOnce("[data-hover-travel-claim]", (button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      claimTravel(button.dataset.hoverTravelClaim || "");
    });
  });
  bindOnce("[data-hover-handbook]", (button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openTravelHandbook();
    });
  });
  bindOnce("[data-hover-reward-walk]", (input) => {
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", (event) => {
      rewardWalkEnabled = event.currentTarget.checked;
      localStorage.setItem("liukanshan_reward_walk_enabled", rewardWalkEnabled ? "1" : "0");
      showToast(rewardWalkEnabled ? "经验增长会走到触发点" : "经验增长仅气泡提示");
      renderPetHoverCard();
    });
  });
  bindOnce("[data-hover-reset]", (button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      resetPet();
    });
  });
}

function renderPetHoverCard() {
  const card = document.getElementById("petHoverCard");
  if (!card) return;
  if (!profile?.adopted) {
    card.innerHTML = "";
    return;
  }
  const activeTravel = travelState?.activeTravel;
  const canTravel = travelState?.canTravel;
  const travelAction = activeTravel?.status === "traveling"
    ? `<button data-hover-travel-return>立即归来</button>`
    : activeTravel?.status === "returned"
      ? `<button data-hover-travel-claim="${escapeHTML(activeTravel.travelId)}">领取内容</button>`
      : `<button data-hover-travel-start ${canTravel === false ? "disabled" : ""}>出门游历</button>`;
  const travelHint = activeTravel?.status === "traveling"
    ? `${travelThemeText(activeTravel.theme)} · ${formatCountdown(activeTravel.expectedReturnAt)}`
    : activeTravel?.status === "returned"
      ? `${travelThemeText(activeTravel.theme)} · 已带回内容`
      : travelState?.blockReason || "阅读内容积攒精力后出门";
  card.innerHTML = `
    <div class="pet-hover-head">
      <span class="pet-mini">山</span>
      <div>
        <strong>${escapeHTML(profile.petName || "刘看山")}</strong>
        <small>Lv.${profile.level} · ${stageText(profile.stage)}</small>
      </div>
    </div>
    <div class="pet-hover-stats">
      <div><small>经验</small><strong>${profile.totalExp}</strong></div>
      <div><small>心情</small><strong>${profile.mood}</strong></div>
      <div><small>饱食</small><strong>${profile.satiety}</strong></div>
      <div><small>精力</small><strong>${profile.travelEnergy ?? 0}</strong></div>
    </div>
    <div class="pet-hover-travel">
      <small>${escapeHTML(travelStatusText(profile.travelStatus))}</small>
      <strong>${escapeHTML(travelHint)}</strong>
    </div>
    <div class="pet-hover-actions">
      <a href="/people/p2wcex">个人页</a>
      ${travelAction}
      <button data-hover-handbook>旅行手账</button>
      <button data-hover-reset>重置</button>
    </div>
    <label class="pet-hover-toggle">
      <input type="checkbox" data-hover-reward-walk ${rewardWalkEnabled ? "checked" : ""}>
      <span>经验走到触发点</span>
    </label>
  `;
  bindPetHoverCard();
}

function closeCharacterNotice() {
  const bubble = document.getElementById("speechBubble");
  window.clearInterval(noticeTimer);
  noticeTimer = null;
  noticeRemaining = 0;
  if (!bubble) return;
  bubble.classList.remove("follow-notice");
  bubble.textContent = profile?.adopted ? `Lv.${profile.level} ${stageText(profile.stage)}` : "你好，我是刘看山~";
}

function showCharacterNotice(message, seconds = 20) {
  const bubble = document.getElementById("speechBubble");
  if (!bubble) return;
  window.clearInterval(noticeTimer);
  noticeRemaining = seconds;

  const render = () => {
    bubble.classList.add("follow-notice");
    bubble.innerHTML = `
      <div class="notice-title">关注动态</div>
      <div class="notice-text">${escapeHTML(message)}</div>
      <button class="notice-close" data-notice-close>关闭 ${noticeRemaining}s</button>
    `;
    bubble.querySelector("[data-notice-close]").addEventListener("click", (event) => {
      event.stopPropagation();
      closeCharacterNotice();
    });
  };

  render();
  noticeTimer = window.setInterval(() => {
    noticeRemaining -= 1;
    if (noticeRemaining <= 0) {
      closeCharacterNotice();
      return;
    }
    render();
  }, 1000);
}

function preloadCharacterModel() {
  if (!modelPreloadPromise) {
    modelPreloadPromise = fetch(MODEL_PATH, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`model preload failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .catch((error) => {
        console.warn("Liu Kanshan model preload skipped", error);
        return null;
      });
  }
  return modelPreloadPromise;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = data.loginUrl || `/auth/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    throw data;
  }
  return data;
}

async function loadAuth() {
  const data = await api("/api/auth/me");
  if (!data.authenticated) {
    return null;
  }
  currentUser = data.user;
  return currentUser;
}

async function loadProfile() {
  const data = await api("/api/p0/pet/profile");
  profile = data.profile;
  syncCharacter();
  return profile;
}

async function loadTravelStatus() {
  if (!profile?.adopted) {
    travelState = null;
    return null;
  }
  const data = await api("/api/p1/travel/status");
  profile = data.profile || profile;
  travelState = data;
  scheduleTravelReturnCheck();
  syncCharacter();
  return travelState;
}

async function loadContents() {
  const data = await api("/api/p0/contents?limit=30");
  feedItems = data.contents;
  return feedItems;
}

function syncCharacter() {
  const container = document.getElementById("roamingCharacter");
  if (!container) return;

  if (!profile?.adopted) {
    container.style.display = "none";
    renderPetHoverCard();
    return;
  }

  container.style.display = "block";
  renderPetHoverCard();
  const idleMessage = `Lv.${profile.level} ${stageText(profile.stage)}`;
  if (!character) {
    try {
      preloadCharacterModel();
      character = initRoamingCharacter({
        modelPath: MODEL_PATH,
        idleMessage,
        arrivedMessage: "我来啦",
        enableClickMove: false,
        scale: 1.25,
        speed: 280,
        teleportDistance: 360,
        teleportDuration: 2400,
        ghostCount: 8,
        screenGhostDuration: 2200,
        screenGhostDelay: 72,
        sceneGhostDuration: 1300,
        spawnEffectDuration: 3000,
        maxGhostCount: 8,
        spawnIntervalFrames: 5,
        initialGhostOpacity: 0.34,
        ghostFadeSpeed: 0.045,
        spawnScaleMultiplier: 1.28,
        enableEmojiBubble: false,
        emojiBubbleConfig: {
          headOffsetY: 1.12,
          bubbleWidth: 1.55,
          bubbleHeight: 0.72,
          tailSize: 0.2,
          borderColor: 0xe63946,
          fontSize: 0.18,
          emojiScale: 0.28,
        },
        evolveEffectConfig: {
          riseHeight: 0.86,
          ringCount: 4,
          ringStartRadius: 0.86,
          ringExpandSpeed: 1.22,
          ringRotateSpeed: 2.15,
          ringColor: 0xffd700,
          particleCount: 240,
          particleColor: 0xffdd44,
          particleUpSpeed: 1.48,
          particleSpread: 1.7,
          evolveTotalTime: 3.8,
          evolveScaleMultiplier: 1.28,
          scalePunchFactor: 1.22,
        },
        idleRingBandConfig: {
          attachTargetName: "Liukanshan",
          orbitRadius: 0.58,
          orbitHeight: 0.18,
          tubeRadius: 0.018,
          tubeSegments: 80,
          color1: 0x66ccff,
          color2: 0xff88cc,
          rotateSpeed: 0.012,
          opacity: 0.86,
        },
        travelGateConfig: {
          gateRadius: 1.02,
          gateRingCount: 4,
          gateColor: 0x4488ff,
          vortexColor: 0x66ccff,
          innerColor: 0x9966ff,
          centerOpacity: 0.48,
          innerOpacity: 0.42,
          ringOpacity: 1.0,
          gatePulseSpeed: 2.4,
          gateRotateSpeed: 1.15,
          gateDistance: 0.56,
          gateHeightOffset: 0.28,
          openDuration: 0.42,
          walkDistance: 0.56,
          fadeScaleMin: 0.06,
          fadeInDuration: 1.6,
          fadeOutDuration: 1.6,
          gateCloseDuration: 0.7,
        },
        messages: ["读到好内容啦", "收到", "看山也在学习"],
      });
    } catch (error) {
      container.classList.add("character-fallback-visible");
      showToast("刘看山模型初始化失败，请刷新重试");
      console.error("Roaming character init failed", error);
    }
  } else {
    character.config.idleMessage = idleMessage;
    if (!noticeTimer) {
      character.setMessage(idleMessage, { autoHide: 1800 });
    }
  }
}

function shell(active) {
  const avatarStyle = currentUser?.avatarPath
    ? `style="background-image:url('${escapeHTML(currentUser.avatarPath)}');background-size:cover;background-position:center;"`
    : "";
  return `
    <header class="site-header">
      <a class="logo" href="/">知乎</a>
      <nav class="nav">
        <a href="#" data-follow-tab>关注</a>
        <a class="${active === "recommend" ? "active" : ""}" href="/">推荐</a>
        <a href="#">热榜</a>
        <a href="#">专栏</a>
        <a class="new-badge" href="#">圈子</a>
        <a href="#">付费咨询</a>
        <a href="#">知学堂</a>
      </nav>
      <div class="search">
        <input value="${active === "people" ? "中国女子在西班牙被刺身亡" : "朋友圈文案"}" aria-label="搜索">
        <button>⌕</button>
      </div>
      <div class="header-actions">
        <button class="purple-btn">直答</button>
        <button class="round-btn">+</button>
        <div class="action-icon"><strong>♟</strong>消息<span class="dot">10</span></div>
        <div class="action-icon"><strong>♞</strong>私信<span class="dot">7</span></div>
        <div class="action-icon"><strong>♟</strong>创作中心</div>
        <a class="avatar ${currentUser?.avatarPath ? "user-avatar-image" : ""}" href="/people/p2wcex" aria-label="个人页" ${avatarStyle}></a>
      </div>
    </header>
  `;
}

function followMomentMessage(data) {
  const latest = data.latestMoment;
  if (!latest) return `你关注的人有 ${data.newCount} 条新动态，去关注 tab 看看`;
  const actor = latest.actorName || "你关注的人";
  const action = latest.actionText || "有了新动态";
  const title = latest.targetTitle ? `：《${latest.targetTitle}》` : "";
  const summary = data.llm?.summary ? `。${data.llm.summary}` : "";
  return `${actor}${action}${title}${summary}，去关注 tab 看看`;
}

function highlightFollowTab() {
  document.querySelectorAll("[data-follow-tab]").forEach((tab) => {
    tab.classList.add("follow-tab-alert");
    window.setTimeout(() => tab.classList.remove("follow-tab-alert"), 5200);
  });
}

async function syncFollowMoments() {
  if (!currentUser || !profile?.adopted) return;
  try {
    const data = await api("/api/p0/follow-moments/sync", {
      method: "POST",
      body: JSON.stringify({ page: 0, perPage: 10 }),
    });
    if (!data.newCount) return;
    profile = data.profile || profile;
    syncCharacter();
    highlightFollowTab();
    const message = followMomentMessage(data);
    showToast(message);
    if (data.reward?.exp || data.reward?.mood) {
      showReward(data.reward, document.querySelector("[data-follow-tab]"));
    }
    renderCurrentRoute();
    window.requestAnimationFrame(() => {
      highlightFollowTab();
      showCharacterNotice(message, 20);
    });
    api("/api/p0/follow-moments/mark-notified", {
      method: "POST",
      body: JSON.stringify({}),
    }).catch(() => {});
  } catch (error) {
    if (!["OAUTH_TOKEN_REQUIRED", "FOLLOW_MOMENTS_SYNC_FAILED"].includes(error.error)) {
      console.warn("Follow moments sync failed", error);
    }
  }
}

function renderLoginGate() {
  const next = encodeURIComponent(window.location.pathname || "/");
  app.innerHTML = `
    <header class="site-header">
      <a class="logo" href="/">知乎</a>
      <nav class="nav">
        <a class="active" href="/">推荐</a>
        <a href="#">热榜</a>
        <a href="#">专栏</a>
      </nav>
      <div class="search">
        <input value="登录后领养刘看山" aria-label="搜索">
        <button>⌕</button>
      </div>
      <div class="header-actions">
        <a class="login-link" href="/auth/login?next=${next}">登录知乎</a>
      </div>
    </header>
    <main class="login-gate">
      <section class="login-panel">
        <div class="login-pet-mark">山</div>
        <h1>登录后领养刘看山</h1>
        <p>使用知乎账号登录后，阅读、点赞、评论和收藏都会转化为刘看山的成长。</p>
        <a class="login-primary" href="/auth/login?next=${next}">登录知乎</a>
      </section>
    </main>
  `;
}

function petPanel() {
  if (!profile?.adopted) {
    return `
      <section class="card side-card pet-panel">
        <div class="pet-title"><span class="pet-mini">山</span><span>刘看山还没到家</span></div>
        <button class="adopt-btn" data-adopt>领养刘看山</button>
      </section>
    `;
  }

  const activeTravel = travelState?.activeTravel;
  const travelAction = activeTravel?.status === "traveling"
    ? `<button class="outline-btn" data-hover-travel-return>立即归来</button>`
    : activeTravel?.status === "returned"
      ? `<button class="outline-btn" data-hover-travel-claim="${escapeHTML(activeTravel.travelId)}">领取带回内容</button>`
      : `<button class="outline-btn" data-hover-travel-start ${travelState?.canTravel === false ? "disabled" : ""}>出门游历</button>`;
  return `
    <section class="card side-card pet-panel">
      <div class="pet-title">
        <span class="pet-mini">山</span>
        <span>${profile.petName}</span>
        <span class="level-pill">Lv.${profile.level}</span>
      </div>
      <div class="pet-stats">
        <div class="stat-box"><small>阶段</small><strong>${stageText(profile.stage)}</strong></div>
        <div class="stat-box"><small>累计经验</small><strong>${profile.totalExp}</strong></div>
        <div class="stat-box"><small>饱食度</small><strong>${profile.satiety}</strong></div>
        <div class="stat-box"><small>心情值</small><strong>${profile.mood}</strong></div>
        <div class="stat-box"><small>游历精力</small><strong>${profile.travelEnergy ?? 0}</strong></div>
        <div class="stat-box"><small>游历状态</small><strong>${travelStatusText(profile.travelStatus)}</strong></div>
      </div>
      <div class="travel-panel-actions">
        ${travelAction}
        <button class="outline-btn" data-hover-handbook>旅行手账</button>
      </div>
      <button class="reset-pet-btn" data-reset-pet>重置刘看山</button>
    </section>
  `;
}

function creatorCard() {
  return `
    <section class="card side-card">
      <div class="creator-head">
        <span>♟ 创作中心 <span class="level-pill">Lv3</span></span>
        <small>草稿箱(1)</small>
      </div>
      <div class="creator-metrics">
        <div><small>今日阅读（播放）数</small><strong>0</strong></div>
        <div><small>今日新增赞同数</small><strong>0</strong></div>
      </div>
      <div class="creator-banner">给妈妈点时间<br>2026 母亲节</div>
      <div class="two-btns">
        <button class="outline-btn">进入创作中心 ›</button>
        <button class="outline-btn">等你来答 ›</button>
      </div>
    </section>
  `;
}

function hotCard() {
  const items = [
    ["深圳女子受精卵钻入主动脉", "732 万"],
    ["美以袭击伊朗", "465 万"],
    ["浏阳烟花厂爆炸致 26 死 61 伤", "441 万"],
    ["四川华蓥瀑布秋千事故", "292 万"],
    ["同济大学通报教师论文造假", "290 万"],
    ["林依晨自曝曾被前男友要挟", "289 万"],
    ["中国油轮霍尔木兹海峡遭袭", "287 万"],
    ["央视硬刚国际足联拒天价版权", "257 万"],
  ];
  return `
    <section class="card side-card">
      <div class="side-title"><span>大家都在搜</span><small>换一换</small></div>
      <ol class="hot-list">
        ${items.map(([text, heat]) => `<li><span>${text}</span><small>${heat}</small><em>热</em></li>`).join("")}
      </ol>
    </section>
  `;
}

function authorPlatformCard() {
  return `
    <section class="card side-card author-platform-card">
      <div class="side-title">盐言作者平台</div>
      <div class="author-platform-banner">
        <span><strong>写好故事，赚高收益！</strong>已有 100 万+作者入驻</span>
        <i class="author-platform-medal" aria-hidden="true"></i>
      </div>
      <button class="outline-btn">去投稿 ›</button>
    </section>
  `;
}

function recommendFollowCard() {
  const users = [
    ["知乎城市指南", "发现本地新问题"],
    ["刘看山陪读员", "和你一起读好内容"],
    ["盐选故事会", "每日精选短篇"],
  ];
  return `
    <section class="card side-card">
      <div class="side-title">推荐关注</div>
      <ul class="follow-list">
        ${users.map(([name, desc]) => `
          <li>
            <span class="follow-avatar"></span>
            <span><strong>${name}</strong><small>${desc}</small></span>
            <button>关注</button>
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function composer() {
  return `
    <section class="card composer">
      <div class="composer-top">
        <span class="avatar"></span>
        <span>分享此刻的想法…</span>
        <div class="composer-tools"><span>#</span><span>☺</span><span>▧</span><span>▣</span><span>▥</span></div>
        <div class="composer-submit"><span>同步到圈子⌄</span><button class="blue-btn">发想法</button></div>
      </div>
      <div class="composer-bottom">
        <span><i class="square-icon green">?</i>提问题</span>
        <span><i class="square-icon blue">■</i>写回答</span>
        <span><i class="square-icon orange">✎</i>写文章</span>
        <span><i class="square-icon pink">▶</i>发视频</span>
      </div>
    </section>
  `;
}

function feedCard(item) {
  const media = item.media
    ? `<div class="feed-media ${escapeHTML(item.media)}">${escapeHTML(item.mediaLabel || "").replace(/\n/g, "<br>")}</div>`
    : "";
  return `
    <article class="card feed-card" data-content-id="${escapeHTML(item.id)}" data-content-type="${escapeHTML(item.type)}">
      <h2><button class="content-open-title" data-open-content="${escapeHTML(item.id)}">${escapeHTML(item.title)}</button></h2>
      <div class="feed-body ${media ? "" : "no-media"}">
        ${media}
        <p>
          ${escapeHTML(item.author)}：${escapeHTML(item.excerpt)}
          <button class="read-link" data-open-content="${escapeHTML(item.id)}">${escapeHTML(item.readText)}⌄</button>
        </p>
      </div>
      <div class="feed-actions">
        <button class="vote-btn" data-interact="${escapeHTML(item.id)}" data-action="like">▲ 赞同 ${item.counts.like}</button>
        <button class="vote-btn small-vote">▼</button>
        <button class="feed-action" data-interact="${escapeHTML(item.id)}" data-action="comment">● ${item.counts.comment} 条评论</button>
        <button class="feed-action" data-interact="${escapeHTML(item.id)}" data-action="collect">★ ${item.counts.collect}</button>
        <button class="feed-action">❤ 103</button>
        <button class="feed-action">↗ 分享</button>
        <button class="feed-action">…</button>
      </div>
    </article>
  `;
}

function renderRecommend() {
  app.innerHTML = `
    ${shell("recommend")}
    <main class="page">
      <section class="recommend-main">
        ${composer()}
        ${feedItems.map(feedCard).join("")}
      </section>
      <aside class="side-stack">
        ${creatorCard()}
        ${petPanel()}
        ${hotCard()}
        ${authorPlatformCard()}
        ${recommendFollowCard()}
      </aside>
    </main>
  `;
  bindCommon();
  bindRecommend();
}

function renderPeople() {
  const displayName = escapeHTML(currentUser?.fullname || "知乎用户");
  const headline = escapeHTML(currentUser?.headline || "这个人还没有填写个人简介。");
  const avatarStyle = currentUser?.avatarPath
    ? `style="background-image:url('${escapeHTML(currentUser.avatarPath)}');background-size:cover;background-position:center;"`
    : "";
  app.innerHTML = `
    ${shell("people")}
    <main class="profile-wrap">
      <section class="card profile-hero">
        <div class="cover">
          <button class="upload-cover">上传封面图片</button>
          <span class="ip-badge">IP 属地北京</span>
        </div>
        <div class="profile-main">
          <div class="profile-avatar ${currentUser?.avatarPath ? "user-avatar-image" : ""}" ${avatarStyle}></div>
          <div class="profile-info">
            <div class="profile-name">
              <h1>${displayName}</h1>
              <span>${headline}</span>
            </div>
            <div class="profile-detail">⌄ 查看详细资料</div>
          </div>
          <button class="edit-btn">编辑个人资料</button>
        </div>
      </section>
      <section class="profile-grid">
        <div class="card">
          <div class="tabs">
            <span>动态</span><span>回答 <small>0</small></span><span>视频 <small>0</small></span><span>提问 <small>0</small></span><span>文章 <small>1</small></span><span>专栏 <small>0</small></span><span>想法 <small>3</small></span><span>收藏 <small>0</small></span><span>划线 <small>0</small></span><span>⌕</span>
          </div>
          <article class="activity">
            <h3>我的动态</h3>
            <div class="activity-meta"><span>发布了想法</span><span>2026-03-19 16:45</span></div>
            <h2>「刘看山陪审团」正式上线！</h2>
            <p>${displayName}：${headline}3 个刘看山化身 AI 助手，帮你拆解知乎复杂讨论，一眼看清共识与争议。</p>
            <div class="activity-img">刘看山陪审团<br>AI 讨论结构图</div>
          </article>
        </div>
        <aside class="side-stack">
          ${creatorCard()}
          ${petPanel()}
          <section class="card side-card">
            <div class="creator-stat">
              <div><small>关注了</small><strong>1</strong></div>
              <div><small>关注者</small><strong>2</strong></div>
            </div>
          </section>
          <section class="card side-card">
            <div class="side-title">个人成就</div>
            <ul class="achievement">
              <li>▲ 获得 6 次赞同</li>
              <li>获得 22 次喜欢，2 次收藏</li>
            </ul>
          </section>
        </aside>
      </section>
    </main>
  `;
  bindCommon();
}

function bindCommon() {
  document.querySelectorAll("[data-adopt]").forEach((button) => {
    button.addEventListener("click", adoptPet);
  });
  document.querySelectorAll("[data-reset-pet]").forEach((button) => {
    button.addEventListener("click", resetPet);
  });
  bindPetHoverCard();
}

function bindRecommend() {
  document.querySelectorAll("[data-consume]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = feedItems.find((entry) => entry.id === button.dataset.consume);
      submitContentEvent(item, item.action, button);
    });
  });

  document.querySelectorAll("[data-open-content]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = feedItems.find((entry) => entry.id === button.dataset.openContent);
      openContent(item, button);
    });
  });

  document.querySelectorAll("[data-interact]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = feedItems.find((entry) => entry.id === button.dataset.interact);
      submitContentEvent(item, button.dataset.action, button);
      button.classList.add("active");
    });
  });
}

async function openContent(item, sourceElement) {
  if (!item) return;
  try {
    const data = await api(`/api/p0/contents/${encodeURIComponent(item.id)}`);
    renderContentModal(data.content);
    if (profile?.adopted) {
      submitContentEvent(item, item.action, sourceElement);
    } else {
      showToast("领养刘看山后，阅读会转化为成长");
    }
  } catch (error) {
    showToast(error.message || "内容加载失败");
  }
}

function renderContentModal(content) {
  document.querySelector(".content-modal")?.remove();
  const modal = document.createElement("div");
  modal.className = "content-modal";
  modal.innerHTML = `
    <div class="content-dialog" role="dialog" aria-modal="true" aria-label="内容全文">
      <button class="content-close" aria-label="关闭">×</button>
      <div class="content-type">${content.type === "video" ? "视频" : content.type === "pin" ? "想法" : content.type === "novel" ? "小说" : "文章"}</div>
      <h1>${escapeHTML(content.title)}</h1>
      <div class="content-author">${escapeHTML(content.author)}</div>
      <div class="content-full">${renderParagraphs(content.fullContent)}</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector(".content-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.remove();
  });
}

let travelReturnTimer = null;

function scheduleTravelReturnCheck() {
  window.clearTimeout(travelReturnTimer);
  const activeTravel = travelState?.activeTravel;
  if (!activeTravel || activeTravel.status !== "traveling") return;
  const delay = Math.max(800, new Date(activeTravel.expectedReturnAt).getTime() - Date.now() + 500);
  travelReturnTimer = window.setTimeout(() => completeTravel(false), delay);
}

function playTravelDeparture(travel) {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight * 0.58;
  character?.setPosition?.(centerX, centerY);
  window.setTimeout(() => {
    character?.startGoTravel?.({
      message: travel.message || "出发旅行！",
      autoHide: 2400,
    });
  }, 80);
}

function playTravelReturn(travel) {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight * 0.58;
  character?.setPosition?.(centerX, centerY);
  character?.startBackHome?.({
    message: travel.message || "旅行回来啦！",
    autoHide: 2800,
  });
  window.setTimeout(() => {
    character?.setPosition?.(window.innerWidth - 150, window.innerHeight - 200);
  }, 3300);
}

async function startTravel() {
  if (!profile?.adopted) {
    showToast("先领养刘看山");
    return;
  }
  try {
    const pet = await ensureEffectCharacter();
    const data = await api("/api/p1/travel/start", {
      method: "POST",
      body: JSON.stringify({ theme: "auto" }),
    });
    profile = data.profile;
    travelState = {
      ...(travelState || {}),
      activeTravel: data.travel,
      canTravel: false,
      blockReason: "刘看山正在游历中",
    };
    syncCharacter();
    renderCurrentRoute();
    pet?.setMessage?.(data.message || "看山出发啦", { autoHide: 2200 });
    playTravelDeparture(data.travel);
    showToast(`${travelThemeText(data.travel.theme)}出发`);
    scheduleTravelReturnCheck();
  } catch (error) {
    if (error.profile) profile = error.profile;
    if (error.activeTravel || error.blockReason) travelState = error;
    syncCharacter();
    renderCurrentRoute();
    showToast(error.message || "暂时不能出门游历");
  }
}

async function completeTravel(force = true) {
  try {
    const data = await api("/api/p1/travel/return", {
      method: "POST",
      body: JSON.stringify({ force }),
    });
    profile = data.profile;
    travelState = {
      ...(travelState || {}),
      activeTravel: data.travel,
      canTravel: false,
      blockReason: "刘看山已经归来，先领取带回的内容",
    };
    syncCharacter();
    renderCurrentRoute();
    playTravelReturn(data.travel);
    showTravelReturnCard(data.travel);
    showToast("刘看山旅行回来啦");
  } catch (error) {
    if (!["TRAVEL_NOT_FINISHED"].includes(error.error)) {
      console.warn("travel return failed", error);
    }
  }
}

async function claimTravel(travelId = "") {
  try {
    const data = await api("/api/p1/travel/claim", {
      method: "POST",
      body: JSON.stringify({ travelId }),
    });
    profile = data.profile;
    await loadTravelStatus();
    renderCurrentRoute();
    if (data.reward) showReward(data.reward, characterElement());
    showToast("游历内容已领取，进入冷却");
    document.querySelector(".travel-return-card")?.remove();
  } catch (error) {
    showToast(error.message || "领取失败");
  }
}

function showTravelReturnCard(travel) {
  document.querySelector(".travel-return-card")?.remove();
  const first = travel.contents?.[0];
  const card = document.createElement("div");
  card.className = "travel-return-card";
  card.innerHTML = `
    <div class="travel-return-head">
      <span>${escapeHTML(travelThemeText(travel.theme))}</span>
      <button aria-label="关闭">×</button>
    </div>
    <strong>${escapeHTML(travel.message || "刘看山带回了好内容")}</strong>
    ${first ? `<p>${escapeHTML(first.title)}</p>` : ""}
    <div class="travel-return-actions">
      ${first ? `<button data-open-travel-content="${escapeHTML(first.id)}">查看内容</button>` : ""}
      <button data-claim-travel="${escapeHTML(travel.travelId)}">领取奖励</button>
    </div>
  `;
  document.body.appendChild(card);
  card.querySelector("[aria-label='关闭']").addEventListener("click", () => card.remove());
  card.querySelector("[data-claim-travel]")?.addEventListener("click", () => claimTravel(travel.travelId));
  card.querySelector("[data-open-travel-content]")?.addEventListener("click", async (event) => {
    const contentId = event.currentTarget.dataset.openTravelContent;
    const data = await api(`/api/p0/contents/${encodeURIComponent(contentId)}`);
    renderContentModal(data.content);
  });
}

async function openTravelHandbook() {
  try {
    const data = await api("/api/p1/travel/handbook?limit=20");
    renderTravelHandbook(data.handbook || []);
  } catch (error) {
    showToast(error.message || "旅行手账加载失败");
  }
}

function renderTravelHandbook(entries) {
  document.querySelector(".travel-handbook-modal")?.remove();
  const modal = document.createElement("div");
  modal.className = "travel-handbook-modal";
  modal.innerHTML = `
    <div class="travel-handbook-dialog" role="dialog" aria-modal="true" aria-label="旅行手账">
      <button class="content-close" aria-label="关闭">×</button>
      <div class="content-type">看山旅行手账</div>
      <h1>刘看山带回的路上风景</h1>
      <div class="travel-handbook-list">
        ${entries.length ? entries.map((entry) => `
          <article class="travel-handbook-entry ${escapeHTML(entry.coverStyle)}">
            <div>
              <small>${escapeHTML(entry.themeTitle)}</small>
              <strong>${escapeHTML(entry.routeText)}</strong>
              <p>${escapeHTML(entry.petQuote)}</p>
            </div>
            <div class="travel-handbook-contents">
              ${(entry.contents || []).map((content) => `
                <button data-open-travel-content="${escapeHTML(content.id)}">${escapeHTML(content.title)}</button>
              `).join("")}
            </div>
          </article>
        `).join("") : `<p class="empty-handbook">还没有旅行记录，攒够精力后让看山出门吧。</p>`}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector(".content-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.remove();
  });
  modal.querySelectorAll("[data-open-travel-content]").forEach((button) => {
    button.addEventListener("click", async () => {
      const data = await api(`/api/p0/contents/${encodeURIComponent(button.dataset.openTravelContent)}`);
      renderContentModal(data.content);
    });
  });
}

async function adoptPet() {
  try {
    const data = await api("/api/p0/pet/adopt", {
      method: "POST",
      body: JSON.stringify({ petName: "刘看山" }),
    });
    profile = data.profile;
    await loadTravelStatus();
    syncCharacter();
    renderCurrentRoute();
    showToast("刘看山已到家");
    character?.setMessage("你好，我是刘看山~", { autoHide: 2600 });
    window.requestAnimationFrame(() => playHomecomingEffect());
  } catch (error) {
    showToast(error.message || "领养失败");
  }
}

async function resetPet() {
  try {
    const data = await api("/api/p0/pet/reset", {
      method: "POST",
      body: JSON.stringify({}),
    });
    profile = data.profile;
    travelState = null;
    const element = characterElement();
    if (element) {
      element.style.display = "none";
      element.classList.remove("pet-homecoming", "pet-exp-gain", "pet-level-up");
    }
    document.querySelector(".pet-effect-layer")?.remove();
    showToast("刘看山状态已重置");
    renderCurrentRoute();
  } catch (error) {
    showToast(error.message || "重置失败");
  }
}

async function submitContentEvent(item, actionType, sourceElement) {
  if (!profile?.adopted) {
    showToast("先去个人页领养刘看山");
    window.history.pushState({}, "", "/people/p2wcex");
    renderCurrentRoute();
    return;
  }

  const normalizedAction = actionType === "watch" ? "watch" : actionType;
  const payload = {
    eventId: `${item.id}_${normalizedAction}_${Date.now()}`,
    contentId: item.id,
    contentType: item.type,
    actionType: normalizedAction,
    completionRatio: normalizedAction === "watch" ? 0.72 : 0.86,
    durationSec: normalizedAction === "watch" ? 96 : 48,
    contentTags: item.tags,
    occurredAt: new Date().toISOString(),
  };

  try {
    const data = await api("/api/p0/pet/content-events", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    profile = data.profile;
    mergeUpdatedContent(data.content);
    await loadTravelStatus();
    syncCharacter();
    showReward(data.reward, sourceElement);
    renderCurrentRoute();
  } catch (error) {
    showToast(error.message || "事件提交失败");
  }
}

function showReward(reward, sourceElement) {
  const partsText = rewardText(reward);
  const message = reward.levelUp
    ? `看山升级啦！Lv.${reward.fromLevel} → Lv.${reward.toLevel}`
    : `看山成长了：${partsText}`;
  showToast(message);
  if (character && reward.levelUp) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight * 0.58;
    character.setPosition?.(centerX, centerY);
    character.playEvolveEffect?.({ message, autoHide: 3900 });
    window.setTimeout(() => {
      character?.setPosition?.(window.innerWidth - 150, window.innerHeight - 200);
      character?.setMessage?.(`Lv.${profile.level} ${stageText(profile.stage)}`, { autoHide: 2200 });
    }, 4200);
  }
  if (sourceElement && character && !reward.levelUp && rewardWalkEnabled) {
    const defaultArrivedMessage = character.config.arrivedMessage;
    character.config.arrivedMessage = message;
    character.moveToElement(sourceElement, { message, useRandomMessage: false });
    window.setTimeout(() => {
      character.config.arrivedMessage = defaultArrivedMessage;
    }, 2600);
  }
  if (!reward.levelUp) {
    character?.setMessage(message, { autoHide: 3200 });
  }
  playRewardEffect(reward, reward.levelUp || rewardWalkEnabled ? sourceElement : null, message);
}

function playRewardEffect(reward, sourceElement, message) {
  const sourceRect = sourceElement?.getBoundingClientRect();
  const center = characterCenter();
  const sourceX = sourceRect ? sourceRect.left + sourceRect.width / 2 : center.x;
  const sourceY = sourceRect ? sourceRect.top + sourceRect.height / 2 : center.y;

  if (reward.levelUp) {
    pulseCharacter("pet-level-up", 1800);
    spawnRing(center.x, center.y, true);
    spawnSparks(center.x, center.y, { count: 20, warm: true });
    spawnFloatChip(`Lv.${reward.toLevel} 升级`, center.x - 36, center.y - 28, true);
    spawnFloatChip(rewardText(reward), sourceX - 38, sourceY - 18, true);
    return;
  }

  pulseCharacter("pet-exp-gain", 1100);
  spawnRing(sourceX, sourceY, false);
  spawnSparks(sourceX, sourceY, { count: 9, warm: reward.mood > 0 });
  spawnFloatChip(rewardText(reward), sourceX - 46, sourceY - 24, false);
}

function renderCurrentRoute() {
  const path = window.location.pathname;
  if (path === "/people/p2wcex") {
    renderPeople();
  } else {
    renderRecommend();
  }
  window.requestAnimationFrame(() => syncCharacter());
}

window.addEventListener("popstate", renderCurrentRoute);
document.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link) return;
  const url = new URL(link.href);
  if (url.origin === window.location.origin && ["/", "/people/p2wcex"].includes(url.pathname)) {
    event.preventDefault();
    window.history.pushState({}, "", url.pathname);
    renderCurrentRoute();
  }
});

const authUser = await loadAuth();
if (authUser) {
  await loadProfile();
  await loadTravelStatus();
  await loadContents();
  renderCurrentRoute();
  syncFollowMoments();
} else {
  renderLoginGate();
}
renderEffectTestPanel();
