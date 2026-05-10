import { initRoamingCharacter } from "/3d-liukanshan-roaming/roaming-character.js?v=32";

const app = document.getElementById("app");
const toast = document.getElementById("toast");

let currentUser = null;
let profile = null;
let travelState = null;
let character = null;
let feedItems = [];
let hotItems = [];
let hotItemsPromise = null;
let hotItemsLoaded = false;
let followMoments = [];
let followMomentsPromise = null;
let followMomentsLoaded = false;
let followSyncError = null;
let communityRing = null;
let communityContents = [];
let communityPromise = null;
let communityLoaded = false;
let communityError = null;
let communityFallbackReason = "";
let leaderboardType = "pet_level";
let leaderboardData = null;
let leaderboardLoaded = false;
let leaderboardError = null;
let leaderboardPanelOpen = false;
let leaderboardPositionTimer = null;
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
  if (reward.satiety) parts.push(`学识值 +${reward.satiety}`);
  if (reward.mood) parts.push(`心情 +${reward.mood}`);
  if (reward.travelEnergy) parts.push(`精力 +${reward.travelEnergy}`);
  return parts.join("，");
}

function handleDecayNotice(decayNotice) {
  if (!decayNotice?.applied) return;
  const parts = [];
  if (decayNotice.totalSatietyDelta) parts.push(`学识值 ${decayNotice.totalSatietyDelta}`);
  if (decayNotice.totalMoodDelta) parts.push(`心情 ${decayNotice.totalMoodDelta}`);
  const suffix = parts.length ? `（${parts.join("，")}）` : "";
  const message = `${decayNotice.message || "看山想和你一起补充新知识"}${suffix}`;
  showToast(message);
  character?.setMessage?.(message, { autoHide: 5200 });
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
  const debugEnabled = new URLSearchParams(window.location.search).has("effectTest")
    || localStorage.getItem("liukanshan_effect_test_panel") === "1";
  if (!panel || !isLocalDebugHost() || !debugEnabled) {
    if (panel) {
      panel.hidden = true;
      panel.innerHTML = "";
    }
    return;
  }
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
    polar: "极地旅行",
    hotspot: "热点旅行",
    arctic: "极地旅行",
    mountain: "热点旅行",
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

function formatMomentTime(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return "";
  const diff = Math.max(0, Date.now() - timestamp * 1000);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < day * 7) return `${Math.floor(diff / day)} 天前`;
  return new Date(timestamp * 1000).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function truncateText(value = "", maxLength = 48) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
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

function stripHTML(value = "") {
  const element = document.createElement("div");
  element.innerHTML = String(value);
  return element.textContent || element.innerText || "";
}

function formatCount(value = 0) {
  const number = Number(value) || 0;
  if (number >= 10000) return `${(number / 10000).toFixed(number >= 100000 ? 0 : 1)} 万`;
  return String(number);
}

function formatUnixTime(value = 0) {
  const timestamp = Number(value) || 0;
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
  bindOnce("[data-hover-leaderboard]", (button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openLeaderboardPanel();
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
      : travelState?.blockReason || "阅读内容积攒学识和精力后出门";
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
      <div><small>学识</small><strong>${profile.satiety}</strong></div>
      <div><small>精力</small><strong>${profile.travelEnergy ?? 0}</strong></div>
    </div>
    <div class="pet-hover-travel">
      <small>${escapeHTML(travelStatusText(profile.travelStatus))}</small>
      <strong>${escapeHTML(travelHint)}</strong>
    </div>
    <div class="pet-hover-actions">
      ${travelAction}
      <button data-hover-handbook>旅行手账</button>
      <button data-hover-leaderboard>排行榜</button>
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
  handleDecayNotice(data.decayNotice);
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
  handleDecayNotice(data.decayNotice);
  scheduleTravelReturnCheck();
  syncCharacter();
  return travelState;
}

async function loadContents() {
  const data = await api("/api/p0/contents?limit=30");
  feedItems = data.contents;
  return feedItems;
}

async function loadHotItems() {
  if (hotItemsPromise) return hotItemsPromise;
  hotItemsPromise = api("/api/p0/hot?limit=30")
    .then((data) => {
      hotItems = data.items || [];
      hotItemsLoaded = true;
      return hotItems;
    })
    .catch((error) => {
      hotItemsPromise = null;
      hotItemsLoaded = true;
      console.warn("Hot list load failed", error);
      throw error;
    });
  return hotItemsPromise;
}

async function loadFollowMoments({ sync = false } = {}) {
  if (followMomentsPromise) return followMomentsPromise;
  followMomentsPromise = (async () => {
    followSyncError = null;
    if (sync) {
      try {
        const syncData = await api("/api/p0/follow-moments/sync", {
          method: "POST",
          body: JSON.stringify({ page: 0, perPage: 30 }),
        });
        profile = syncData.profile || profile;
      } catch (error) {
        followSyncError = error;
        if (!["OAUTH_TOKEN_REQUIRED", "FOLLOW_MOMENTS_SYNC_FAILED"].includes(error.error)) {
          console.warn("Follow moments sync failed", error);
        }
      }
    }
    const data = await api("/api/p0/follow-moments?limit=30");
    followMoments = data.data || [];
    followMomentsLoaded = true;
    return followMoments;
  })().catch((error) => {
    followMomentsPromise = null;
    followMomentsLoaded = true;
    throw error;
  });
  return followMomentsPromise;
}

async function loadCommunity({ refresh = false } = {}) {
  if (communityPromise && !refresh) return communityPromise;
  if (refresh) communityPromise = null;
  communityPromise = api("/api/p1/community/ring?pageNum=1&pageSize=20")
    .then((data) => {
      communityRing = data.ring || null;
      communityContents = data.contents || [];
      communityLoaded = true;
      communityError = null;
      communityFallbackReason = data.fallback ? (data.fallbackReason || "目标圈子暂不可读，已展示可读开放圈子内容") : "";
      return data;
    })
    .catch((error) => {
      communityPromise = null;
      communityLoaded = true;
      communityError = error;
      communityFallbackReason = "";
      console.warn("Community load failed", error);
      throw error;
  });
  return communityPromise;
}

async function loadLeaderboard(type = leaderboardType, { refresh = false } = {}) {
  leaderboardType = type === "travel_count" ? "travel_count" : "pet_level";
  if (leaderboardData?.rankType === leaderboardType && leaderboardLoaded && !refresh) {
    return leaderboardData;
  }
  leaderboardLoaded = false;
  leaderboardError = null;
  const endpoint = leaderboardType === "travel_count"
    ? "/api/p1/leaderboard/travel-count?limit=50"
    : "/api/p1/leaderboard/pet-level?limit=50";
  try {
    leaderboardData = await api(endpoint);
    leaderboardLoaded = true;
    return leaderboardData;
  } catch (error) {
    leaderboardLoaded = true;
    leaderboardError = error;
    throw error;
  }
}

function leaderboardTitle(type = leaderboardType) {
  return type === "travel_count" ? "游历榜" : "等级榜";
}

function leaderboardEmptyText(type = leaderboardType) {
  return type === "travel_count"
    ? "还没有完成游历的看山，攒够精力让它出门吧。"
    : "还没有看山上榜，领养后阅读和互动就能成长。";
}

function leaderboardVisual(item) {
  const level = Number(item?.level || 1);
  return `
    <div class="leaderboard-visual level-${Math.min(level, 10)}">
      <span>山</span>
      <small>Lv.${level}</small>
    </div>
  `;
}

function leaderboardItem(item) {
  const isTravel = leaderboardType === "travel_count";
  const metric = isTravel
    ? `<strong>${formatCount(item.travelCount)} 次</strong><small>已领取 ${formatCount(item.claimedTravelCount)} 次</small>`
    : `<strong>Lv.${item.level}</strong><small>${formatCount(item.totalExp)} 经验</small>`;
  return `
    <article class="leaderboard-item ${item.isCurrentUser ? "is-current" : ""} rank-${item.rank <= 3 ? item.rank : "normal"}">
      <div class="leaderboard-rank">${item.rank}</div>
      ${leaderboardVisual(item)}
      <div class="leaderboard-user">
        <strong>${escapeHTML(item.fullname || "知乎用户")}</strong>
        <small>${escapeHTML(item.petName || "刘看山")} · ${escapeHTML(stageText(item.stage))}</small>
      </div>
      <div class="leaderboard-metric">
        ${metric}
      </div>
    </article>
  `;
}

function currentUserRankCard(data = leaderboardData) {
  const item = data?.currentUserItem;
  if (!profile?.adopted) {
    return `<div class="leaderboard-my-card muted">领养刘看山后即可参与排行榜</div>`;
  }
  if (!item) {
    return `<div class="leaderboard-my-card muted">${leaderboardType === "travel_count" ? "你还没有完成游历" : "你暂未进入榜单"}</div>`;
  }
  return `
    <div class="leaderboard-my-card">
      <span>我的名次</span>
      <strong>No.${item.rank}</strong>
      <small>Lv.${item.level} · ${formatCount(item.totalExp)} 经验 · 游历 ${formatCount(item.travelCount)} 次</small>
    </div>
  `;
}

function renderLeaderboardPanel() {
  let panel = document.getElementById("leaderboardPanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "leaderboardPanel";
    panel.className = "leaderboard-panel";
    document.body.appendChild(panel);
  }
  const items = leaderboardData?.rankType === leaderboardType ? (leaderboardData.items || []) : [];
  const body = !leaderboardLoaded
    ? `<div class="leaderboard-empty">榜单加载中</div>`
    : leaderboardError
      ? `<div class="leaderboard-empty">${escapeHTML(leaderboardError.message || "榜单加载失败")}</div>`
      : items.length
        ? `<div class="leaderboard-list">${items.map(leaderboardItem).join("")}</div>`
        : `<div class="leaderboard-empty">${escapeHTML(leaderboardEmptyText())}</div>`;
  panel.innerHTML = `
    <div class="leaderboard-head">
      <div>
        <small>刘看山排行榜</small>
        <strong>${leaderboardTitle()}</strong>
      </div>
      <button aria-label="关闭排行榜" data-leaderboard-close>×</button>
    </div>
    <div class="leaderboard-tabs">
      <button class="${leaderboardType === "pet_level" ? "active" : ""}" data-leaderboard-type="pet_level">等级榜</button>
      <button class="${leaderboardType === "travel_count" ? "active" : ""}" data-leaderboard-type="travel_count">游历榜</button>
    </div>
    ${currentUserRankCard()}
    ${body}
  `;
  panel.querySelector("[data-leaderboard-close]").addEventListener("click", closeLeaderboardPanel);
  panel.querySelectorAll("[data-leaderboard-type]").forEach((button) => {
    button.addEventListener("click", () => switchLeaderboard(button.dataset.leaderboardType));
  });
  positionLeaderboardPanel();
}

function positionLeaderboardPanel() {
  const panel = document.getElementById("leaderboardPanel");
  const pet = characterElement();
  if (!panel || !pet) return;
  if (window.innerWidth <= 720) {
    panel.style.left = "12px";
    panel.style.right = "12px";
    panel.style.top = "auto";
    panel.style.bottom = "14px";
    return;
  }
  const rect = pet.getBoundingClientRect();
  const panelWidth = 360;
  const gap = 14;
  const left = rect.left >= panelWidth + gap
    ? rect.left - panelWidth - gap
    : Math.min(window.innerWidth - panelWidth - 16, rect.right + gap);
  const top = Math.max(78, Math.min(window.innerHeight - 520, rect.top + 12));
  panel.style.left = `${Math.max(16, left)}px`;
  panel.style.right = "auto";
  panel.style.top = `${top}px`;
  panel.style.bottom = "auto";
}

async function openLeaderboardPanel(type = leaderboardType) {
  if (!profile?.adopted) {
    showToast("领养刘看山后查看排行榜");
    return;
  }
  leaderboardPanelOpen = true;
  leaderboardType = type === "travel_count" ? "travel_count" : "pet_level";
  renderLeaderboardPanel();
  character?.setMessage?.("看看大家的看山都长到哪儿啦", { autoHide: 2200 });
  window.clearInterval(leaderboardPositionTimer);
  leaderboardPositionTimer = window.setInterval(positionLeaderboardPanel, 500);
  try {
    await loadLeaderboard(leaderboardType, { refresh: true });
  } catch (error) {
    showToast(error.message || "排行榜加载失败");
  }
  if (leaderboardPanelOpen) renderLeaderboardPanel();
}

function closeLeaderboardPanel() {
  leaderboardPanelOpen = false;
  window.clearInterval(leaderboardPositionTimer);
  leaderboardPositionTimer = null;
  document.getElementById("leaderboardPanel")?.remove();
}

async function switchLeaderboard(type) {
  const nextType = type === "travel_count" ? "travel_count" : "pet_level";
  if (leaderboardType === nextType && leaderboardLoaded) return;
  leaderboardType = nextType;
  renderLeaderboardPanel();
  try {
    await loadLeaderboard(leaderboardType, { refresh: true });
  } catch (error) {
    showToast(error.message || "排行榜加载失败");
  }
  if (leaderboardPanelOpen) renderLeaderboardPanel();
}

function syncCharacter() {
  const container = document.getElementById("roamingCharacter");
  if (!container) return;

  if (!profile?.adopted) {
    container.style.display = "none";
    closeLeaderboardPanel();
    renderPetHoverCard();
    return;
  }

  container.style.display = "block";
  renderPetHoverCard();
  if (leaderboardPanelOpen) window.requestAnimationFrame(positionLeaderboardPanel);
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
        messages: ["读到好内容啦", "学识值补充中", "看山也在学习"],
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
        <a class="${active === "follow" ? "active" : ""}" href="/follow" data-follow-tab>关注</a>
        <a class="${active === "recommend" ? "active" : ""}" href="/">推荐</a>
        <a class="${active === "hot" ? "active" : ""}" href="/hot">热榜</a>
        <a class="new-badge ${active === "community" ? "active" : ""}" href="/community">黑客松脑洞补给站</a>
      </nav>
      <div class="search">
        <input value="${active === "people" ? "中国女子在西班牙被刺身亡" : "朋友圈文案"}" aria-label="搜索">
        <button aria-label="搜索">${headerIcon("search")}</button>
      </div>
      <div class="header-actions">
        <button class="purple-btn">${headerIcon("zhida")}<span>直答</span></button>
        <button class="round-btn" aria-label="创作">${headerIcon("plus")}</button>
        <div class="action-icon">${headerIcon("bell")}<span>消息</span><span class="dot">10</span></div>
        <div class="action-icon">${headerIcon("chat")}<span>私信</span><span class="dot">7</span></div>
        <div class="action-icon">${headerIcon("creator")}<span>创作中心</span></div>
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
        <div class="stat-box"><small>学识值</small><strong>${profile.satiety}</strong></div>
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

function svgIcon(className, body, viewBox = "0 0 24 24") {
  return `<svg class="${className}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;
}

function headerIcon(name) {
  const icons = {
    search: {
      viewBox: "0 0 16 16",
      body: `<path fill-rule="evenodd" d="M10.218 11.632a5.5 5.5 0 1 1 1.414-1.414l2.075 2.075a1 1 0 0 1-1.414 1.414l-2.075-2.075ZM10.6 7.1a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clip-rule="evenodd"></path>`,
    },
    zhida: {
      body: `<path d="M21.37.96a.245.245 0 0 1 .46 0l.413 1.115c.082.223.259.4.483.483l1.114.412a.245.245 0 0 1 0 .46l-1.114.412a.817.817 0 0 0-.483.483L21.83 5.44a.245.245 0 0 1-.46 0l-.412-1.115a.818.818 0 0 0-.483-.483L19.36 3.43a.245.245 0 0 1 0-.46l1.115-.412c.223-.083.4-.26.483-.483L21.37.96ZM14.675 14.738a2.02 2.02 0 0 0 .05-.127l1.584-4.46a1.59 1.59 0 0 0-1.499-2.122h-3.05c-.715 0-1.363.381-1.715.981l.01-.021c.392-.887 1.223-2.766 2.625-4.07 1.648-1.531 4.286-1.28 6.035.136 2.507 2.029 3.717 5.515 2.525 8.895-1.434 4.068-5.478 6.79-9.792 6.79h-.143c1.805-1.424 2.818-4.207 3.37-6.002Z"></path><path d="M.752 7.655.167 9.317.2 9.312C1.104 8.017 2.6 8.02 5.302 8.024H5.534L1.05 20.74H7.275c.264-.027.607-.043 1.041-.043 3.86 0 5.464-3.838 6.138-5.452.063-.15.118-.282.166-.39a1.988 1.988 0 0 1-1.768 1.08H11.56c-.592 0-1.171.176-1.663.506l-.776.521a.124.124 0 0 1-.185-.143l.25-.716a.127.127 0 0 0-.12-.169 1.07 1.07 0 0 1-1.01-1.428l1.83-5.153c.017-.047.035-.093.055-.138.061-.184.122-.376.185-.572.591-1.851 1.333-4.173 3.756-5.354H6.726c-3.923 0-5.018 1.767-5.584 3.256l-.237.673c-.052.155-.102.302-.153.438Z"></path>`,
    },
    plus: {
      body: `<path fill-rule="evenodd" d="M13.25 3.25a1.25 1.25 0 1 0-2.5 0v7.5h-7.5a1.25 1.25 0 1 0 0 2.5h7.5v7.5a1.25 1.25 0 1 0 2.5 0v-7.5h7.5a1.25 1.25 0 0 0 0-2.5h-7.5v-7.5Z" clip-rule="evenodd"></path>`,
    },
    bell: {
      body: `<path fill-rule="evenodd" d="M9.723 21.271c0-.42.34-.76.76-.76h3.043a.76.76 0 0 1 0 1.521h-3.043a.76.76 0 0 1-.76-.76Z" clip-rule="evenodd"></path><path d="M11.153 3.115c0-.618.376-1.115.844-1.115.469 0 .845.499.845 1.115v.183c3.997.369 7.012 4.117 7.024 8.515V17.468h.253a.76.76 0 1 1 0 1.521H3.891a.76.76 0 0 1 0-1.521h.253V11.813c.011-4.392 3.02-8.137 7.009-8.514v-.184Z"></path>`,
    },
    chat: {
      body: `<path fill-rule="evenodd" d="M2 11c0 1.79.553 3.45 1.498 4.82L2.6 18.667a.6.6 0 0 0 .751.753l3.07-.96A8.5 8.5 0 1 0 2 11Zm11.46 9.414c-.457.16-.506.794-.034.904A6.96 6.96 0 0 0 15 21.5c1.148 0 2.422-.31 3.444-.912.357-.217.658-.378 1.043-.252l1.414.42c.357.112.679-.168.574-.546l-.47-1.57a.736.736 0 0 1 .05-.632c.602-1.108.945-2.32.945-3.498 0-1.07-.248-2.11-.7-3.046-.21-.435-.815-.25-.872.23-.47 3.954-3.211 7.394-6.968 8.72Z" clip-rule="evenodd"></path>`,
    },
    creator: {
      body: `<path fill-rule="evenodd" d="M6.5 7.5A5.5 5.5 0 0 1 12 2a5.5 5.5 0 0 1 5.5 5.5A5.5 5.5 0 0 1 12 13a5.5 5.5 0 0 1-5.5-5.5Zm8.11 9.498c.404-.408.91-1 1.17-1.51.067-.133.13-.284.165-.442.034-.15.058-.373-.033-.602a.872.872 0 0 0-.545-.509 1.37 1.37 0 0 0-.604-.043c-.657.082-1.518.184-2.373.24-.867.055-1.68.058-2.254-.041-1.189-.204-2.045-.19-2.781.087-.722.272-1.25.773-1.804 1.302-1.533 1.462-2.434 3.311-2.65 4.831-.11.78.535 1.339 1.199 1.339h8.1a.96.96 0 0 0 .955-.929c.06-1.767.7-2.96 1.456-3.723Zm6.504-1.568a.75.75 0 1 0-1.228-.86l-2.903 4.146a.75.75 0 0 0 1.229.86l2.902-4.146Zm-4.227 6.099a.75.75 0 1 0-1.241-.842l-.267.392a.75.75 0 0 0 1.242.842l.266-.392Z" clip-rule="evenodd"></path>`,
    },
  };
  const icon = icons[name];
  return svgIcon(`header-svg header-svg-${name}`, icon.body, icon.viewBox || "0 0 24 24");
}

function composerToolIcons() {
  return [
    svgIcon("composer-tool-icon", `
      <path fill-rule="evenodd" d="M9.91 2.65c.469.116.755.59.64 1.06l-.844 3.415h6.997l.947-3.835a.875.875 0 0 1 1.7.42l-.845 3.415H21.5a.875.875 0 0 1 0 1.75h-3.427l-1.544 6.25H19.5a.875.875 0 0 1 0 1.75h-3.403l-.948 3.835a.875.875 0 0 1-1.699-.42l.844-3.415H7.297l-.948 3.835a.875.875 0 0 1-1.698-.42l.843-3.415H2.5a.875.875 0 1 1 0-1.75h3.427l1.544-6.25H4.5a.875.875 0 1 1 0-1.75h3.403l.948-3.835a.875.875 0 0 1 1.059-.64Zm4.816 12.475 1.545-6.25H9.273l-1.544 6.25h6.997Z" clip-rule="evenodd"></path>
    `),
    svgIcon("composer-tool-icon", `
      <path d="M14.413 14.223a.785.785 0 0 1 1.45.601A4.174 4.174 0 0 1 12 17.4a4.19 4.19 0 0 1-2.957-1.221 4.174 4.174 0 0 1-.906-1.355.785.785 0 1 1 1.449-.601 2.604 2.604 0 0 0 1.413 1.41 2.621 2.621 0 0 0 2.849-.566c.242-.242.434-.529.565-.844ZM8.6 8.77a1.308 1.308 0 1 1 0 2.615 1.308 1.308 0 0 1 0-2.615ZM15.4 8.77a1.308 1.308 0 1 1 0 2.615 1.308 1.308 0 0 1 0-2.615Z"></path>
      <path fill-rule="evenodd" d="M12 1.573c5.758 0 10.427 4.669 10.427 10.427S17.758 22.427 12 22.427 1.573 17.758 1.573 12 6.242 1.573 12 1.573Zm0 1.746a8.681 8.681 0 1 0 .001 17.362A8.681 8.681 0 0 0 12 3.32Z" clip-rule="evenodd"></path>
    `),
    svgIcon("composer-tool-icon", `
      <path fill-rule="evenodd" d="M8.75 6.125a2.625 2.625 0 1 0 0 5.25 2.625 2.625 0 0 0 0-5.25ZM7.875 8.75a.875.875 0 1 1 1.75 0 .875.875 0 0 1-1.75 0Z" clip-rule="evenodd"></path>
      <path fill-rule="evenodd" d="M2.625 6.5A3.875 3.875 0 0 1 6.5 2.625h11A3.875 3.875 0 0 1 21.375 6.5v11a3.875 3.875 0 0 1-3.875 3.875h-11A3.875 3.875 0 0 1 2.625 17.5v-11ZM6.5 4.375A2.125 2.125 0 0 0 4.375 6.5v8.223l1.928-1.23a3.875 3.875 0 0 1 3.757-.23l.744.357c.648.31 1.409.272 2.023-.102l3.718-2.265a.875.875 0 0 1 .91 1.494l-3.718 2.265a3.875 3.875 0 0 1-3.689.186l-.743-.356a2.125 2.125 0 0 0-2.06.126l-2.774 1.77a.886.886 0 0 1-.096.053v.709c0 1.174.951 2.125 2.125 2.125h11a2.125 2.125 0 0 0 2.125-2.125v-11A2.125 2.125 0 0 0 17.5 4.375h-11Z" clip-rule="evenodd"></path>
    `),
    svgIcon("composer-tool-icon", `
      <path fill-rule="evenodd" d="M12.704 13.784c1.31-.756 1.31-2.646 0-3.402l-2.858-1.65c-1.31-.756-2.946.19-2.946 1.701v3.3c0 1.512 1.636 2.457 2.946 1.701l2.858-1.65Zm-.875-1.886a.214.214 0 0 1 0 .37l-2.858 1.65a.214.214 0 0 1-.321-.184v-3.3c0-.166.178-.268.32-.186l2.86 1.65Z" clip-rule="evenodd"></path>
      <path fill-rule="evenodd" d="M.625 7A3.875 3.875 0 0 1 4.5 3.125h11A3.875 3.875 0 0 1 19.375 7v.29l1.272-.603a1.875 1.875 0 0 1 2.678 1.694v7.338a1.875 1.875 0 0 1-2.678 1.694l-1.272-.602V17a3.875 3.875 0 0 1-3.875 3.875h-11A3.875 3.875 0 0 1 .625 17V7Zm18.75 7.878V9.222a.88.88 0 0 0 .075-.031l1.946-.923a.125.125 0 0 1 .179.113v7.338a.125.125 0 0 1-.179.113l-1.946-.923a.876.876 0 0 0-.075-.031ZM4.5 4.875A2.125 2.125 0 0 0 2.375 7v10c0 1.174.951 2.125 2.125 2.125h11A2.125 2.125 0 0 0 17.625 17V7A2.125 2.125 0 0 0 15.5 4.875h-11Z" clip-rule="evenodd"></path>
    `),
    svgIcon("composer-tool-icon", `
      <path fill-rule="evenodd" d="M13.5 2.125A2.375 2.375 0 0 1 15.875 4.5v2.625H18.5A2.375 2.375 0 0 1 20.875 9.5v10.625H22a.875.875 0 0 1 0 1.75H2a.875.875 0 0 1 0-1.75h1.125V12.5A2.375 2.375 0 0 1 5.5 10.125h2.625V4.5A2.375 2.375 0 0 1 10.5 2.125h3Zm-8 9.75a.625.625 0 0 0-.625.625v7.625h3.25v-8.25H5.5Zm5-8a.625.625 0 0 0-.625.625v15.625h4.25V4.5a.625.625 0 0 0-.625-.625h-3Zm5.375 16.25h3.25V9.5a.625.625 0 0 0-.625-.625h-2.625v11.25Z" clip-rule="evenodd"></path>
    `),
  ].map((icon) => `<span>${icon}</span>`).join("");
}

function composerActionIcon(src) {
  return `<img class="square-url-icon" src="${src}" alt="" aria-hidden="true">`;
}

function feedActionIcon(name) {
  const icons = {
    up: `<svg class="vote-icon" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="M13.792 3.681c-.781-1.406-2.803-1.406-3.584 0l-7.79 14.023c-.76 1.367.228 3.046 1.791 3.046h15.582c1.563 0 2.55-1.68 1.791-3.046l-7.79-14.023Z" clip-rule="evenodd"></path></svg>`,
    down: `<svg class="vote-icon" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="M13.792 20.319c-.781 1.406-2.803 1.406-3.584 0L2.418 6.296c-.76-1.367.228-3.046 1.791-3.046h15.582c1.563 0 2.55 1.68 1.791 3.046l-7.79 14.023Z" clip-rule="evenodd"></path></svg>`,
    comment: `<svg class="feed-action-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2.37c5.67 0 10.266 4.085 10.267 9.125 0 2.08-.786 3.997-2.105 5.532a1.064 1.064 0 0 0-.247.91l.644 3.056c.24 1.157-.66 1.58-1.444 1.157l-2.925-1.584c-.53-.287-1.153-.338-1.743-.21-.784.172-1.604.265-2.447.265-5.67 0-10.268-4.087-10.268-9.126C1.732 6.455 6.33 2.37 12 2.37Z"></path></svg>`,
    collect: `<svg class="feed-action-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M10.424 2.828c.7-1.213 2.452-1.213 3.152 0l2.47 4.285c.038.064.1.109.172.124l4.839 1.027c1.37.29 1.912 1.956.974 2.997l-3.312 3.674a.26.26 0 0 0-.065.201l.52 4.92c.146 1.393-1.27 2.422-2.55 1.852l-4.518-2.014a.26.26 0 0 0-.212 0l-4.518 2.014c-1.28.57-2.696-.46-2.55-1.853l.52-4.919a.26.26 0 0 0-.065-.2L1.969 11.26c-.938-1.041-.396-2.707.974-2.997l4.839-1.027a.26.26 0 0 0 .171-.124l2.471-4.285Z"></path></svg>`,
    like: `<svg class="feed-action-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="M16.984 3.324c1.73.315 3.125 1.472 4.04 2.978 1.893 3.116.758 6.989-1.384 9.556a23.241 23.241 0 0 1-3.96 3.737c-.66.486-1.308.895-1.902 1.196-.579.294-1.166.517-1.695.57a.845.845 0 0 1-.145.002c-.529-.038-1.127-.267-1.708-.564a14.407 14.407 0 0 1-1.947-1.232 23.512 23.512 0 0 1-4.081-3.88C2.165 13.207 1.139 9.536 2.85 6.514 3.742 4.94 5.14 3.71 6.896 3.348c1.606-.332 3.363.094 5.103 1.394 1.696-1.267 3.409-1.704 4.985-1.418Z" clip-rule="evenodd"></path></svg>`,
    share: `<svg class="feed-action-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M13.338 3.855c0-1.37 1.676-2.036 2.616-1.038l7.146 7.586a2.33 2.33 0 0 1 0 3.194l-7.146 7.586c-.94.998-2.616.333-2.616-1.038v-3.633a.815.815 0 0 0-.695-.807l-1.368-.205a11.65 11.65 0 0 0-7.657 1.494L1.452 18.29a.946.946 0 0 1-.555.115c-.426-.065-.686-.4-.62-.896.066-.496.22-1.37.22-1.37 1.354-4.63 5.21-8.006 10.006-8.005h2.02c.45 0 .815-.365.815-.816V3.855Z"></path></svg>`,
    more: `<svg class="feed-action-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM10.5 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM16.5 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"></path></svg>`,
  };
  return `<span class="feed-icon-wrap">${icons[name]}</span>`;
}

function hotFireIcon() {
  return svgIcon("zh-hot-fire", `
    <path fill-rule="evenodd" d="M14.602 21.118a8.89 8.89 0 0 0 3.72-2.232 8.85 8.85 0 0 0 2.618-6.31c0-.928-.14-1.836-.418-2.697a8.093 8.093 0 0 0-1.204-2.356s.025.035-.045-.055-.1-.115-.1-.115c-.955-1.078-1.504-1.984-1.726-2.854-.06-.232-.138-.88-.22-1.824L17.171 2l-.681.02c-.654.018-1.089.049-1.366.096a7.212 7.212 0 0 0-3.77 1.863 6.728 6.728 0 0 0-1.993 3.544l-.088.431-.182-.4a5.032 5.032 0 0 1-.326-.946 71.054 71.054 0 0 1-.204-.916l-.199-.909-.833.42c-.52.263-.862.462-1.076.624a8.588 8.588 0 0 0-2.5 2.976 8.211 8.211 0 0 0-.888 3.723c0 2.402.928 4.657 2.616 6.35a8.87 8.87 0 0 0 3.093 2.027c-.919-.74-1.593-1.799-1.76-3.051-.186-.703.05-2.352.849-2.79 0 1.938 2.202 3.198 4.131 2.62 2.07-.62 3.07-2.182 2.773-5.688 1.245 1.402 1.65 2.562 1.838 3.264.603 2.269-.357 4.606-2.003 5.86Z" clip-rule="evenodd"></path>
  `);
}

function composer() {
  return `
    <section class="card composer">
      <div class="composer-top">
        <span class="composer-avatar avatar"></span>
        <span class="composer-placeholder">分享此刻的想法...</span>
        <div class="composer-tools" aria-hidden="true">${composerToolIcons()}</div>
        <div class="composer-submit">
          <span class="sync-target">同步到圈子${svgIcon("composer-caret", `<path d="m7 10 5 5 5-5"></path>`)}</span>
          <button class="blue-btn">发想法</button>
        </div>
      </div>
      <div class="composer-bottom">
        <button>${composerActionIcon("https://static.zhihu.com/heifetz/assets/question.a5a0c912.png")}<span>提问题</span></button>
        <button>${composerActionIcon("https://static.zhihu.com/heifetz/assets/answer.cf78e2ff.png")}<span>写回答</span></button>
        <button>${composerActionIcon("https://static.zhihu.com/heifetz/assets/article.58c0b223.png")}<span>写文章</span></button>
        <button>${composerActionIcon("https://static.zhihu.com/heifetz/assets/video.eb5f3bfe.png")}<span>发视频</span></button>
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
        <button class="vote-btn" data-interact="${escapeHTML(item.id)}" data-action="like">${feedActionIcon("up")}<span>赞同 ${item.counts.like}</span></button>
        <button class="vote-btn vote-btn-down" aria-label="反对">${feedActionIcon("down")}</button>
        <button class="feed-action feed-action-comment" data-interact="${escapeHTML(item.id)}" data-action="comment">${feedActionIcon("comment")}<span>${item.counts.comment} 条评论</span></button>
        <button class="feed-action" data-interact="${escapeHTML(item.id)}" data-action="collect">${feedActionIcon("collect")}<span>${item.counts.collect}</span></button>
        <button class="feed-action">${feedActionIcon("like")}<span>103</span></button>
        <button class="feed-action feed-action-share">${feedActionIcon("share")}<span>分享</span></button>
        <button class="feed-action feed-action-more" aria-label="更多">${feedActionIcon("more")}</button>
      </div>
    </article>
  `;
}

function followMomentTitle(moment) {
  const target = moment.target || {};
  const action = moment.action_text || "";
  const excerpt = target.excerpt || "";
  if (target.title) return target.title;
  if (action.includes("文章")) return "一篇文章";
  if (action.includes("问题")) return "一个问题";
  if (action.includes("回答")) return truncateText(excerpt || "一条回答", 38);
  return truncateText(excerpt || "一条关注动态", 38);
}

function followMomentCard(moment) {
  const actor = moment.actor || {};
  const target = moment.target || {};
  const targetAuthor = target.author || {};
  const title = followMomentTitle(moment);
  const excerpt = target.excerpt || "";
  const author = targetAuthor.name ? `${targetAuthor.name}：` : "";
  const timeText = formatMomentTime(moment.action_time);
  const action = moment.action_text || "有了新动态";
  return `
    <article class="card follow-moment-card">
      <div class="follow-moment-source">
        <span class="follow-moment-avatar avatar"></span>
        <span><strong>${escapeHTML(actor.name || "知乎用户")}</strong>${escapeHTML(action)}</span>
        ${timeText ? `<small>${escapeHTML(timeText)}</small>` : ""}
      </div>
      <h2><button class="content-open-title">${escapeHTML(title)}</button></h2>
      ${excerpt ? `
        <div class="follow-moment-body">
          <p>${escapeHTML(author)}${escapeHTML(excerpt)}</p>
          <button class="read-link">阅读全文⌄</button>
        </div>
      ` : ""}
      <div class="feed-actions follow-moment-actions">
        <button class="vote-btn">${feedActionIcon("up")}<span>赞同</span></button>
        <button class="vote-btn vote-btn-down" aria-label="反对">${feedActionIcon("down")}</button>
        <button class="feed-action feed-action-comment">${feedActionIcon("comment")}<span>添加评论</span></button>
        <button class="feed-action">${feedActionIcon("collect")}<span>收藏</span></button>
        <button class="feed-action">${feedActionIcon("like")}<span>喜欢</span></button>
        <button class="feed-action feed-action-share">${feedActionIcon("share")}<span>分享</span></button>
        <button class="feed-action feed-action-more" aria-label="更多">${feedActionIcon("more")}</button>
      </div>
    </article>
  `;
}

function hotListItem(item, index) {
  const rank = item.rank || index + 1;
  const url = item.url || "https://www.zhihu.com/hot";
  const thumbnail = item.thumbnailUrl
    ? `<a class="zh-hot-img" href="${escapeHTML(url)}"><img src="${escapeHTML(item.thumbnailUrl)}" alt=""></a>`
    : "";
  const summary = item.summary
    ? `<p class="zh-hot-excerpt">${escapeHTML(item.summary)}</p>`
    : "";
  const heatMetric = item.heatText
    ? `<span class="zh-hot-heat">${hotFireIcon()}${escapeHTML(item.heatText)}</span>`
    : "";
  return `
    <article class="zh-hot-item">
      <div class="zh-hot-index">
        <span class="zh-hot-rank ${rank <= 3 ? "is-hot" : ""}">${rank}</span>
        ${item.debut ? `<span class="zh-hot-new">新</span>` : ""}
      </div>
      <div class="zh-hot-content">
        <a class="zh-hot-title" href="${escapeHTML(url)}">${escapeHTML(item.title)}</a>
        ${summary}
        <div class="zh-hot-metrics">
          ${heatMetric}
          <button class="zh-hot-share">${feedActionIcon("share")}<span>分享</span></button>
        </div>
      </div>
      ${thumbnail}
    </article>
  `;
}

function communityHero() {
  const ring = communityRing || {};
  const avatar = ring.ringAvatar
    ? `<img src="${escapeHTML(ring.ringAvatar)}" alt="">`
    : `<span>圈</span>`;
  const fallbackNotice = communityFallbackReason
    ? `<div class="community-notice">目标圈子暂未开放读取权限，当前展示可读开放圈子内容。</div>`
    : "";
  return `
    <section class="card community-hero">
      <div class="community-avatar">${avatar}</div>
      <div class="community-info">
        <h1>${escapeHTML(ring.ringName || "黑客松脑洞补给站")}</h1>
        <p>${escapeHTML(ring.ringDesc || "真实圈子数据加载中")}</p>
        <div class="community-metrics">
          <span>${formatCount(ring.membershipNum)} 成员</span>
          <span>${formatCount(ring.discussionNum)} 讨论</span>
        </div>
        ${fallbackNotice}
      </div>
      <button class="outline-btn" data-refresh-community>刷新</button>
    </section>
  `;
}

function communityPinCard(pin) {
  const text = stripHTML(pin.content || "");
  const images = (pin.images || []).slice(0, 3);
  const imageBlock = images.length
    ? `<div class="community-images">${images.map((url) => `<img src="${escapeHTML(url)}" alt="">`).join("")}</div>`
    : "";
  const title = pin.title || truncateText(text, 42) || "圈子动态";
  const comments = (pin.comments || []).slice(0, 2);
  return `
    <article class="card community-card" data-community-pin="${escapeHTML(pin.pinId)}">
      <div class="community-card-head">
        <span class="follow-moment-avatar avatar"></span>
        <span><strong>${escapeHTML(pin.authorName || "知乎用户")}</strong><small>${escapeHTML(formatUnixTime(pin.publishTime))}</small></span>
      </div>
      <h2><button class="content-open-title" data-open-community="${escapeHTML(pin.pinId)}">${escapeHTML(title)}</button></h2>
      <p>${escapeHTML(truncateText(text, 180))}<button class="read-link" data-open-community="${escapeHTML(pin.pinId)}">阅读全文⌄</button></p>
      ${imageBlock}
      ${comments.length ? `
        <div class="community-comments-preview">
          ${comments.map((comment) => `<p><strong>${escapeHTML(comment.authorName)}</strong>：${escapeHTML(truncateText(stripHTML(comment.content), 68))}</p>`).join("")}
        </div>
      ` : ""}
      <div class="feed-actions community-actions">
        <button class="vote-btn" data-community-like="${escapeHTML(pin.pinId)}">${feedActionIcon("up")}<span>赞同 ${formatCount(pin.likeNum)}</span></button>
        <button class="feed-action feed-action-comment" data-open-community="${escapeHTML(pin.pinId)}">${feedActionIcon("comment")}<span>${formatCount(pin.commentNum)} 条评论</span></button>
        <button class="feed-action">${feedActionIcon("collect")}<span>${formatCount(pin.favNum)}</span></button>
        <button class="feed-action feed-action-share">${feedActionIcon("share")}<span>分享</span></button>
      </div>
    </article>
  `;
}

function renderCommunity() {
  if (!communityContents.length && !communityLoaded) {
    const pendingCommunity = loadCommunity();
    pendingCommunity
      .then(() => {
        if (window.location.pathname === "/community") renderCommunity();
      })
      .catch(() => {
        if (window.location.pathname === "/community") showToast("圈子数据加载失败");
      });
  }
  const emptyText = communityError
    ? (communityError.message || "圈子数据加载失败")
    : "圈子数据加载中";
  app.innerHTML = `
    ${shell("community")}
    <main class="page community-page">
      <section class="community-main">
        ${communityHero()}
        ${communityContents.length
          ? communityContents.map(communityPinCard).join("")
          : `<section class="card follow-empty">${escapeHTML(emptyText)}</section>`}
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
  bindCommunity();
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

function renderFollow() {
  if (!followMoments.length && !followMomentsLoaded) {
    const pendingFollowMoments = loadFollowMoments({ sync: true });
    pendingFollowMoments
      .then(() => {
        if (window.location.pathname === "/follow") renderFollow();
      })
      .catch(() => {
        if (window.location.pathname === "/follow") showToast("关注动态加载失败");
      });
  }
  const emptyText = followSyncError?.error === "OAUTH_TOKEN_REQUIRED"
    ? "重新登录知乎后查看关注动态"
    : "暂无关注动态";
  app.innerHTML = `
    ${shell("follow")}
    <main class="page follow-page">
      <section class="follow-main">
        ${followMoments.length
          ? followMoments.map(followMomentCard).join("")
          : `<section class="card follow-empty">${followMomentsLoaded ? emptyText : "关注动态加载中"}</section>`}
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
}

function renderHot() {
  if (!hotItems.length && !hotItemsLoaded) {
    const pendingHotItems = loadHotItems();
    pendingHotItems
      .then(() => {
        if (window.location.pathname === "/hot") renderHot();
      })
      .catch(() => {
        if (window.location.pathname === "/hot") showToast("热榜加载失败");
      });
  }
  app.innerHTML = `
    ${shell("hot")}
    <main class="page hot-page">
      <section class="zh-hot-list-card">
        ${hotItems.length
          ? hotItems.map(hotListItem).join("")
          : `<div class="zh-hot-empty">${hotItemsLoaded ? "暂无热榜" : "热榜加载中"}</div>`}
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

function bindCommunity() {
  document.querySelector("[data-refresh-community]")?.addEventListener("click", async () => {
    try {
      communityLoaded = false;
      await loadCommunity({ refresh: true });
      renderCommunity();
      showToast("圈子已刷新");
    } catch (error) {
      showToast(error.message || "圈子刷新失败");
    }
  });
  document.querySelectorAll("[data-open-community]").forEach((button) => {
    button.addEventListener("click", () => {
      const pin = communityContents.find((entry) => entry.pinId === button.dataset.openCommunity);
      openCommunityPin(pin, button);
    });
  });
  document.querySelectorAll("[data-community-like]").forEach((button) => {
    button.addEventListener("click", () => likeCommunityPin(button.dataset.communityLike, button));
  });
}

async function likeCommunityPin(pinId, sourceElement) {
  try {
    const data = await api("/api/p1/community/reaction", {
      method: "POST",
      body: JSON.stringify({ contentToken: pinId, contentType: "pin", actionValue: 1 }),
    });
    if (data.profile) profile = data.profile;
    syncCharacter();
    if (data.reward) showReward(data.reward, sourceElement);
    sourceElement?.classList.add("active");
    showToast("已同步点赞到圈子");
  } catch (error) {
    showToast(error.message || "圈子点赞失败");
  }
}

async function openCommunityPin(pin, sourceElement) {
  if (!pin) return;
  renderCommunityModal(pin, pin.comments || [], true);
  try {
    const data = await api(`/api/p1/community/comments?contentToken=${encodeURIComponent(pin.pinId)}&contentType=pin&pageNum=1&pageSize=30`);
    renderCommunityModal(pin, data.comments || [], false);
    if (profile?.adopted) {
      const synthetic = {
        id: `community_${pin.pinId}`,
        type: "pin",
        action: "read",
        tags: ["community", "circle"],
      };
      submitContentEvent(synthetic, "read", sourceElement);
    }
  } catch (error) {
    showToast(error.message || "评论加载失败");
  }
}

function renderCommunityModal(pin, comments = [], loading = false) {
  document.querySelector(".community-modal")?.remove();
  const modal = document.createElement("div");
  modal.className = "content-modal community-modal";
  const title = pin.title || truncateText(stripHTML(pin.content), 42) || "圈子动态";
  const images = (pin.images || []).slice(0, 6);
  modal.innerHTML = `
    <div class="content-dialog community-dialog" role="dialog" aria-modal="true" aria-label="圈子内容">
      <button class="content-close" aria-label="关闭">×</button>
      <div class="content-type">圈子动态</div>
      <h1>${escapeHTML(title)}</h1>
      <div class="content-author">${escapeHTML(pin.authorName || "知乎用户")} ${formatUnixTime(pin.publishTime) ? ` · ${escapeHTML(formatUnixTime(pin.publishTime))}` : ""}</div>
      <div class="content-full">${renderParagraphs(stripHTML(pin.content || ""))}</div>
      ${images.length ? `<div class="community-modal-images">${images.map((url) => `<img src="${escapeHTML(url)}" alt="">`).join("")}</div>` : ""}
      <form class="community-comment-form">
        <input name="content" maxlength="240" placeholder="用刘看山的好奇心聊一句">
        <button class="blue-btn" type="submit">评论</button>
      </form>
      <div class="community-modal-comments">
        <h2>评论</h2>
        ${loading ? `<p class="community-muted">评论加载中</p>` : ""}
        ${comments.length
          ? comments.map((comment) => `
            <article>
              <strong>${escapeHTML(comment.authorName)}</strong>
              <p>${escapeHTML(stripHTML(comment.content))}</p>
              <small>${escapeHTML(formatUnixTime(comment.publishTime))} · ${formatCount(comment.likeCount)} 赞</small>
            </article>
          `).join("")
          : (!loading ? `<p class="community-muted">暂无评论</p>` : "")}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector(".content-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.remove();
  });
  modal.querySelector(".community-comment-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitCommunityComment(pin, event.target);
  });
}

async function submitCommunityComment(pin, form) {
  const input = form.elements.content;
  const content = input.value.trim();
  if (!content) return;
  form.querySelector("button").disabled = true;
  try {
    const data = await api("/api/p1/community/comment", {
      method: "POST",
      body: JSON.stringify({ contentToken: pin.pinId, contentType: "pin", content }),
    });
    if (data.profile) profile = data.profile;
    syncCharacter();
    if (data.reward) showReward(data.reward, form.querySelector("button"));
    showToast("评论已发布到圈子");
    communityLoaded = false;
    await loadCommunity({ refresh: true });
    const freshPin = communityContents.find((entry) => entry.pinId === pin.pinId) || pin;
    const commentsData = await api(`/api/p1/community/comments?contentToken=${encodeURIComponent(pin.pinId)}&contentType=pin&pageNum=1&pageSize=30`);
    renderCommunityModal(freshPin, commentsData.comments || [], false);
  } catch (error) {
    showToast(error.message || "评论发布失败");
    form.querySelector("button").disabled = false;
  }
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
    handleDecayNotice(data.decayNotice);
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
    handleDecayNotice(error.decayNotice);
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
  const count = (travel.contents || []).length;
  const card = document.createElement("div");
  card.className = "travel-return-card";
  card.innerHTML = `
    <div class="travel-return-head">
      <span>${escapeHTML(travelThemeText(travel.theme))}</span>
      <button aria-label="关闭">×</button>
    </div>
    <strong>${escapeHTML(travel.message || "刘看山转了一圈回来啦")}</strong>
    ${count ? `<p>带回 ${count} 条素材，点开手账看看看山的汇报～</p>` : ""}
    <div class="travel-return-actions">
      <button data-open-handbook-from-return>看看手账</button>
      <button data-claim-travel="${escapeHTML(travel.travelId)}">领取奖励</button>
    </div>
  `;
  document.body.appendChild(card);
  card.querySelector("[aria-label='关闭']").addEventListener("click", () => card.remove());
  card.querySelector("[data-claim-travel]")?.addEventListener("click", () => claimTravel(travel.travelId));
  card.querySelector("[data-open-handbook-from-return]")?.addEventListener("click", () => {
    card.remove();
    openTravelHandbook();
  });
}

function renderTravelHandbookEntry(entry) {
  const status = entry.llmSummaryStatus || "skipped";
  const summaryText = (entry.llmSummary || "").trim();
  const quote = (entry.llmPetQuote || "").trim() || entry.petQuote || "";
  const highlights = Array.isArray(entry.llmHighlights) ? entry.llmHighlights : [];
  let badgeLabel = "";
  let badgeClass = "";
  if (status === "ready" && summaryText) {
    badgeLabel = "看山的现场汇报";
    badgeClass = "ready";
  } else if (status === "processing" || status === "pending") {
    badgeLabel = "看山正在整理…";
    badgeClass = "pending";
  } else if (status === "failed") {
    badgeLabel = "看山没整理出来，给你看素材清单";
    badgeClass = "failed";
  }
  const summaryBlock = summaryText
    ? `<p class="handbook-llm-summary">${escapeHTML(summaryText)}</p>`
    : `<p class="handbook-route-text">${escapeHTML(entry.routeText || "")}</p>`;
  const badgeBlock = badgeLabel
    ? `<span class="handbook-llm-badge ${badgeClass}">${escapeHTML(badgeLabel)}</span>`
    : "";
  const highlightsBlock = highlights.length
    ? `<ul class="handbook-highlights">${highlights
        .map(
          (item) => `
        <li>
          <strong>${escapeHTML(item.title || "")}</strong>
          ${item.reason ? `<span>${escapeHTML(item.reason)}</span>` : ""}
        </li>`,
        )
        .join("")}</ul>`
    : "";
  const contentsBlock = (entry.contents || [])
    .map((content) => travelContentButtonHTML(content))
    .join("");
  return `
    <article class="travel-handbook-entry ${escapeHTML(entry.coverStyle || "")}">
      <div>
        <small>${escapeHTML(entry.themeTitle || "")}</small>
        ${badgeBlock}
        ${summaryBlock}
        <p class="handbook-pet-quote">${escapeHTML(quote)}</p>
        ${highlightsBlock}
      </div>
      <div class="travel-handbook-contents">
        ${contentsBlock}
      </div>
    </article>
  `;
}

function travelSourceLabel(source) {
  if (source === "follow_moment") return "关注动态";
  if (source === "hot_list") return "知乎热榜";
  return "";
}

const handbookContentMap = new Map();

function travelContentButtonHTML(content) {
  const sourceLabel = travelSourceLabel(content.source);
  const metaText = content.source === "hot_list"
    ? (content.meta?.heatText || "")
    : (content.meta?.actorName ? `${content.meta.actorName} ${content.meta.actionText || ""}`.trim() : (content.author || ""));
  if (content.sourceRef) {
    handbookContentMap.set(content.sourceRef, {
      title: content.title,
      excerpt: content.excerpt,
      author: content.author,
      meta: content.meta,
    });
  }
  return `
    <button class="handbook-content-button"
      data-handbook-content-source="${escapeHTML(content.source || "")}"
      data-handbook-content-url="${escapeHTML(content.url || "")}"
      data-handbook-content-ref="${escapeHTML(content.sourceRef || "")}">
      ${sourceLabel ? `<span class="handbook-content-source">${escapeHTML(sourceLabel)}</span>` : ""}
      <span class="handbook-content-title">${escapeHTML(content.title || "")}</span>
      ${metaText ? `<span class="handbook-content-meta">${escapeHTML(metaText)}</span>` : ""}
    </button>
  `;
}

function isSafeHttpUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value, window.location.href);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function handleHandbookContentClick(button) {
  const url = button.dataset.handbookContentUrl;
  if (isSafeHttpUrl(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const ref = button.dataset.handbookContentRef;
  const payload = (ref && handbookContentMap.get(ref)) || {};
  showTravelMaterialModal(payload, button.dataset.handbookContentSource);
}

function showTravelMaterialModal(payload, source) {
  document.querySelector(".travel-material-modal")?.remove();
  const sourceLabel = travelSourceLabel(source);
  const meta = payload.meta || {};
  const modal = document.createElement("div");
  modal.className = "travel-material-modal";
  modal.innerHTML = `
    <div class="travel-material-dialog" role="dialog" aria-modal="true" aria-label="素材详情">
      <button class="content-close" aria-label="关闭">×</button>
      ${sourceLabel ? `<div class="content-type">${escapeHTML(sourceLabel)}</div>` : ""}
      <h2>${escapeHTML(payload.title || "")}</h2>
      ${meta.actorName ? `<p class="material-actor"><strong>${escapeHTML(meta.actorName)}</strong> ${escapeHTML(meta.actionText || "")}</p>` : ""}
      ${payload.author ? `<p class="material-author">作者：${escapeHTML(payload.author)}</p>` : ""}
      ${payload.excerpt ? `<p class="material-excerpt">${escapeHTML(payload.excerpt)}</p>` : ""}
      ${meta.heatText ? `<p class="material-heat">${escapeHTML(meta.heatText)}</p>` : ""}
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector(".content-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.remove();
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
        ${entries.length ? entries.map((entry) => renderTravelHandbookEntry(entry)).join("") : `<p class="empty-handbook">还没有旅行记录，攒够精力后让看山出门吧。</p>`}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector(".content-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.remove();
  });
  modal.querySelectorAll(".handbook-content-button").forEach((button) => {
    button.addEventListener("click", () => handleHandbookContentClick(button));
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
    closeLeaderboardPanel();
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
    handleDecayNotice(data.decayNotice);
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
  } else if (path === "/follow") {
    renderFollow();
  } else if (path === "/hot") {
    renderHot();
  } else if (path === "/community") {
    renderCommunity();
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
  if (url.origin === window.location.origin && ["/", "/people/p2wcex", "/hot", "/follow", "/community"].includes(url.pathname)) {
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
  if (window.location.pathname === "/hot") {
    await loadHotItems();
  } else {
    loadHotItems().catch(() => {});
  }
  if (window.location.pathname === "/follow") {
    await loadFollowMoments({ sync: true });
  }
  if (window.location.pathname === "/community") {
    await loadCommunity();
  }
  renderCurrentRoute();
  syncFollowMoments();
} else {
  renderLoginGate();
}
renderEffectTestPanel();
