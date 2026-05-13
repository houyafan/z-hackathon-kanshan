import * as THREE from "three";
import { gsap } from "https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm";
import { initRoamingCharacter } from "/3d-liukanshan-roaming/roaming-character.js?v=47";

const app = document.getElementById("app");
const toast = document.getElementById("toast");

let currentUser = null;
let profile = null;
let dailyStat = null;
let _patHandlerAttached = false;
let _lastPatAt = 0;
let travelState = null;
let character = null;
let feedItems = [];
let feedSeed = "";
let feedNextOffset = 0;
let feedHasMore = true;
let feedLoading = false;
let feedScrollBound = false;
let threeColumnLayoutFrame = 0;
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
let leaderboardPromise = null;
let leaderboardLockedScrollY = 0;
let adminOverview = null;
let levelVisuals = null;
let levelVisualsPromise = null;
let modelPreloadPromise = null;
let _activeCommentAssist = null;
let noticeTimer = null;
let noticeRemaining = 0;
let idleBandVisible = true;
let _prevWakeStatus = null;
let _lastWakeBubbleAt = null;
let travelDepartureVisibleUntil = 0;
let homecomingReturnTimer = null;
let levelUpReturnTimer = null;
let levelEndingTimer = null;
let travelAnimationTimer = null;
const savedRewardWalk = localStorage.getItem("liukanshan_reward_walk_enabled") ?? localStorage.getItem("liukanshan_level_walk_enabled");
let rewardWalkEnabled = savedRewardWalk !== "0";
let selectedPetSkin = "normal";
const MODEL_PATH = "/3d-liukanshan-roaming/liukanshan-slot.glb?v=5";
const ONBOARDING_VERSION = "v2";
const ONBOARDING_KEY = `liukanshan_onboarding_${ONBOARDING_VERSION}`;
const STORY_INTRO_VERSION = "v1";
const AUTHOR_NOTE_COLLAPSED_KEY = "liukanshan_author_note_collapsed";
const AUTHOR_ARTICLE_URL = "https://zhuanlan.zhihu.com/p/2037610794875970544";
const ADOPTION_EFFECT_MS = 6200;
const LEVEL_UP_EFFECT_MS = 6500;
const EFFECT_SETTLE_MS = 650;
const RECOMMEND_PAGE_SIZE = 10;
const FALLBACK_LEVEL_REQUIREMENTS = [
  { level: 1, title: "星途起点", requiredTotalExp: 0 },
  { level: 2, title: "星章萌新", requiredTotalExp: 10 },
  { level: 3, title: "星光信使", requiredTotalExp: 120 },
  { level: 4, title: "行星记录员", requiredTotalExp: 250 },
  { level: 5, title: "星际见习官", requiredTotalExp: 450 },
  { level: 6, title: "星图导航员", requiredTotalExp: 700 },
  { level: 7, title: "深空开拓者", requiredTotalExp: 1000 },
  { level: 8, title: "知识探测者", requiredTotalExp: 1400 },
  { level: 9, title: "星际领航员", requiredTotalExp: 1900 },
  { level: 10, title: "宇宙知识领航者", requiredTotalExp: 2500 },
];
const PET_SKINS = [
  { id: "normal", label: "普通", assetBase: "/static/assets/pet-level", tone: "normal" },
  { id: "yanxuan", label: "盐选会员", assetBase: "/static/assets/yanxuan-member", tone: "gold" },
  { id: "knowledge", label: "知识会员", assetBase: "/static/assets/knowledge-member", tone: "blue" },
];
const PET_SKIN_BY_ID = new Map(PET_SKINS.map((skin) => [skin.id, skin]));
selectedPetSkin = normalizePetSkin(localStorage.getItem("liukanshan_pet_skin"));
const RECOMMEND_GROWTH_TIP = "刘看山成长互动仅在推荐列表生效，进入推荐页阅读、点赞、评论、收藏后可获得成长。";
const ADMIN_USER_TOKENS = new Set(["p2wcex", "sunny-27-1-97"]);
const ADMIN_USER_UIDS = new Set(["1908940156829918831", "2013197829758268031"]);
const ANALYTICS_VISIT_KEY = "liukanshan_analytics_visit_id";
const ANALYTICS_REFER_KEY = "liukanshan_analytics_last_path";
const ANALYTICS_EXPOSE_KEY_PREFIX = "liukanshan_pet_panel_exposed_";
const ANALYTICS_SHARE_REFER_KEY_PREFIX = "liukanshan_share_refer_";
const INTERACTION_NOTICE_TITLE = "看山互动彩蛋";
const INTERACTION_BUBBLE_MESSAGES = {
  rotate: [
    "按住 Command 拖动我，可以把看山转过来看看 3D 小身板。",
    "看山进入展示模式啦，左转右转都可以，围巾也要给你看清楚。",
    "转一转我，今天也是努力保持帅气正面的刘看山。",
    "镜头交给你，我负责乖乖站好被研究。",
  ],
  move: [
    "拖动我可以搬到你喜欢的位置，我会在那儿继续陪你读知乎。",
    "看山搬家中，正在找一个更舒服的陪伴角落。",
    "把我挪近一点也可以，读到好内容我会第一时间冒泡。",
    "移动成功预备中，今天的陪伴席位由你决定。",
  ],
};
let onboardingTimer = null;
let onboardingSnoozedUntil = 0;
let analyticsQueue = [];
let analyticsFlushTimer = null;
let analyticsLastPagePath = "";
let storyIntroTypingTimer = null;
let storyIntroComicState = null;
let levelEndingComicState = null;
let storyIntroScrollState = null;
const ONBOARDING_BLOCKING_SELECTOR = [
  ".content-modal",
  ".growth-log-modal",
  ".leaderboard-modal",
  ".travel-handbook-modal",
  ".travel-material-modal",
  ".share-card-overlay",
  ".story-intro-modal",
  ".level-ending-modal",
].join(", ");

const STORY_INTRO_TEXT = [
  "在知识宇宙的边缘，有一颗名叫「知乎星」的星球。",
  "很久以前，这颗星球因为人们不再分享、不再阅读，光芒渐渐黯淡，变成了宇宙里一颗不起眼的灰色小点。而住在这颗星球上的北极熊「刘看山」，也失去了所有能量，变成了一只只能眨眼睛的「星途小白」。",
  "直到知乎向全宇宙发出邀请：谁能陪人类一起阅读、收集知识的星光，谁就能重新点亮这颗星球。于是，刘看山来到了你的首页，开启了他的星程。",
].join("\n\n");

const STORY_COMIC_ASSET_VERSION = "20260512-1134";
const STORY_COMIC_FRAMES = [
  {
    image: `/imgs/1.png?v=${STORY_COMIC_ASSET_VERSION}`,
    alt: "刘看山背景故事分镜 1",
  },
  {
    image: `/imgs/2.png?v=${STORY_COMIC_ASSET_VERSION}`,
    alt: "刘看山背景故事分镜 2",
  },
  {
    image: `/imgs/3.png?v=${STORY_COMIC_ASSET_VERSION}`,
    alt: "刘看山背景故事分镜 3",
  },
  {
    image: `/imgs/4.png?v=${STORY_COMIC_ASSET_VERSION}`,
    alt: "刘看山背景故事分镜 4",
  },
  {
    image: `/imgs/5.png?v=${STORY_COMIC_ASSET_VERSION}`,
    alt: "刘看山背景故事分镜 5",
  },
  {
    image: `/imgs/6.png?v=${STORY_COMIC_ASSET_VERSION}`,
    alt: "刘看山背景故事分镜 6",
  },
  {
    image: `/imgs/7.png?v=${STORY_COMIC_ASSET_VERSION}`,
    alt: "刘看山背景故事分镜 7",
  },
  {
    image: `/imgs/8.png?v=${STORY_COMIC_ASSET_VERSION}`,
    alt: "刘看山背景故事分镜 8",
  },
];
const STORY_COMIC_AGGREGATE_IMAGE = `/imgs/漫剧.png?v=${STORY_COMIC_ASSET_VERSION}`;

const LEVEL_ENDING_COMIC_ASSET_VERSION = "20260512-1339";
const LEVEL_ENDING_COMIC_FRAMES = [
  {
    image: `/imgs/9.png?v=${LEVEL_ENDING_COMIC_ASSET_VERSION}`,
    alt: "刘看山终章故事分镜 1",
  },
  {
    image: `/imgs/10.png?v=${LEVEL_ENDING_COMIC_ASSET_VERSION}`,
    alt: "刘看山终章故事分镜 2",
  },
  {
    image: `/imgs/11.png?v=${LEVEL_ENDING_COMIC_ASSET_VERSION}`,
    alt: "刘看山终章故事分镜 3",
  },
  {
    image: `/imgs/12.png?v=${LEVEL_ENDING_COMIC_ASSET_VERSION}`,
    alt: "刘看山终章故事分镜 4",
  },
  {
    image: `/imgs/13.png?v=${LEVEL_ENDING_COMIC_ASSET_VERSION}`,
    alt: "刘看山终章故事分镜 5",
  },
  {
    image: `/imgs/14.png?v=${LEVEL_ENDING_COMIC_ASSET_VERSION}`,
    alt: "刘看山终章故事分镜 6",
  },
  {
    image: `/imgs/15.png?v=${LEVEL_ENDING_COMIC_ASSET_VERSION}`,
    alt: "刘看山终章故事分镜 7",
  },
  {
    image: `/imgs/16.png?v=${LEVEL_ENDING_COMIC_ASSET_VERSION}`,
    alt: "刘看山终章故事分镜 8",
  },
];
const LEVEL_ENDING_COMIC_AGGREGATE_IMAGE = `/imgs/终章.png?v=${LEVEL_ENDING_COMIC_ASSET_VERSION}`;

const LEVEL_MILESTONES = {
  1: {
    title: "星途起点",
    quote: "你好呀，我是刘看山。我的星球需要你的阅读星光，能陪我一起点亮它吗？",
    feature: "旅程开启：刘看山正式来到你的首页，等待一起点亮知乎星。",
  },
  2: {
    title: "星章萌新",
    quote: "谢谢你的第一束星光！看，我身上已经有了代表勇气的星章啦！",
    feature: "获得第一个徽章：完成首次阅读后，刘看山开始积累阅读成就。",
  },
  3: {
    title: "星光信使",
    quote: "收到了你的知识碎片！我已经能带着星光，在宇宙中送信啦～",
    feature: "传递知识：看山从懵懂萌新，成长为知识星光的小信使。",
  },
  4: {
    title: "行星记录员",
    quote: "我戴上了记录帽！每一篇你读过的文章，我都帮你记在星星里啦！",
    feature: "记录阅读轨迹：看山开始帮你收藏一路读过的知识星点。",
  },
  5: {
    title: "星际见习官",
    quote: "我通过了见习考核！以后就让我陪你一起，去更远的知识宇宙吧！",
    feature: "探索伙伴成型：解锁更高阶内容探索的陪伴感。",
  },
  6: {
    title: "星图导航员",
    quote: "戴上护目镜，我能看清知识的星路啦！跟着我，再也不会迷路～",
    feature: "星图导航：面对多元内容时，看山会成为你的阅读导航者。",
  },
  7: {
    title: "深空开拓者",
    quote: "我拿到了深空任务旗！我们要向更深处的知识宇宙进发了！",
    feature: "深空探索：参与社区活动后，看山开启更远的探索阶段。",
  },
  8: {
    title: "知识探测者",
    quote: "我戴上了探测头灯！有了它，再暗的知识角落我都能找到～",
    feature: "知识探测：深度阅读会帮看山发现更隐秘的优质内容。",
  },
  9: {
    title: "星际领航员",
    quote: "我的法杖亮起来了！现在，我能带着星光，指引其他迷路的旅行者啦！",
    feature: "社区领航：看山开始成为社区里的阅读领航伙伴。",
  },
  10: {
    title: "宇宙知识领航者",
    quote: "谢谢你，和你一起，我终于重新点亮了知乎星！从今往后，我们一起，做宇宙里最亮的那颗知识星吧。",
    feature: "终极养成达成：知乎星重新被知识星光点亮。",
  },
};

const LEVEL_10_ENDING_TEXT = [
  "知乎星重新亮起来了。",
  "那些曾经黯淡的环形山、知识海和星轨，因为你一次次阅读、互动和分享，又有了明亮的轮廓。",
  "刘看山不再是只能眨眼睛的星途小白。他带着你收集的知识星光，成为了「宇宙知识领航者」。",
  "从今天起，他会继续陪你在知乎里读下去、问下去、发现下去。你们点亮的不只是一颗星球，也是一段属于自己的阅读旅程。",
].join("\n\n");

function randomId(prefix = "evt") {
  const value = window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${value}`;
}

function analyticsVisitId() {
  let visitId = sessionStorage.getItem(ANALYTICS_VISIT_KEY);
  if (!visitId) {
    visitId = randomId("visit");
    sessionStorage.setItem(ANALYTICS_VISIT_KEY, visitId);
  }
  return visitId;
}

function analyticsPath() {
  return `${window.location.pathname}${window.location.search || ""}`;
}

function analyticsRefererPath() {
  const stored = sessionStorage.getItem(ANALYTICS_REFER_KEY);
  if (stored) return stored;
  try {
    if (document.referrer) {
      const url = new URL(document.referrer);
      if (url.origin === window.location.origin) return `${url.pathname}${url.search || ""}`;
    }
  } catch {
    return "";
  }
  return "";
}

function flushAnalytics() {
  if (!currentUser || !analyticsQueue.length) return;
  const events = analyticsQueue.splice(0, 50);
  window.clearTimeout(analyticsFlushTimer);
  analyticsFlushTimer = null;
  fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitId: analyticsVisitId(), events }),
  }).catch(() => {
    analyticsQueue = [...events, ...analyticsQueue].slice(0, 100);
  });
}

function scheduleAnalyticsFlush(immediate = false) {
  if (immediate) {
    flushAnalytics();
    return;
  }
  window.clearTimeout(analyticsFlushTimer);
  analyticsFlushTimer = window.setTimeout(flushAnalytics, 1000);
}

function trackEvent(eventName, options = {}) {
  if (!currentUser || !eventName) return;
  analyticsQueue.push({
    eventId: options.eventId || randomId("evt"),
    eventName,
    visitId: analyticsVisitId(),
    pagePath: options.pagePath || analyticsPath(),
    refererPath: options.refererPath ?? analyticsRefererPath(),
    targetType: options.targetType || "",
    targetId: options.targetId || "",
    props: options.props || {},
    clientTs: new Date().toISOString(),
  });
  if (analyticsQueue.length >= 20) {
    flushAnalytics();
  } else {
    scheduleAnalyticsFlush(Boolean(options.immediate));
  }
}

function trackPageView(path) {
  if (analyticsLastPagePath === path) return;
  analyticsLastPagePath = path;
  trackEvent("page_view", {
    pagePath: path,
    refererPath: analyticsRefererPath(),
    props: { route: path },
  });
  sessionStorage.setItem(ANALYTICS_REFER_KEY, path);
}

function trackShareReferIfNeeded() {
  const params = new URLSearchParams(window.location.search || "");
  const shareUser = params.get("lks_share_user");
  const shareId = params.get("lks_share_id");
  if (!shareUser && !shareId) return;
  const key = `${ANALYTICS_SHARE_REFER_KEY_PREFIX}${analyticsVisitId()}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  trackEvent("pet_share_refer", {
    targetType: "share",
    targetId: shareId || shareUser || "unknown",
    props: { shareUser, shareId },
  });
}

function observePetPanelExposure() {
  if (!currentUser) return;
  const panel = document.querySelector("[data-pet-panel]");
  if (!panel) return;
  const key = `${ANALYTICS_EXPOSE_KEY_PREFIX}${analyticsVisitId()}`;
  if (sessionStorage.getItem(key)) return;
  const markExposed = () => {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    trackEvent("pet_module_expose", {
      targetType: "pet",
      targetId: "liukanshan",
      props: { adopted: Boolean(profile?.adopted), route: window.location.pathname },
    });
    trackShareReferIfNeeded();
  };
  if (!("IntersectionObserver" in window)) {
    markExposed();
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.35)) {
      observer.disconnect();
      markExposed();
    }
  }, { threshold: [0.35] });
  observer.observe(panel);
}

function isAdminUser(user = currentUser) {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (ADMIN_USER_TOKENS.has(String(user.userToken || "").trim())) return true;
  const uid = user.uid ?? user.userId;
  if (uid != null && ADMIN_USER_UIDS.has(String(uid))) return true;
  return false;
}

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

function normalizePetSkin(value) {
  return PET_SKINS.some((skin) => skin.id === value) ? value : "normal";
}

function activePetSkinId(level = profile?.level) {
  return Number(level || 1) >= 2 ? normalizePetSkin(selectedPetSkin) : "normal";
}

function activePetSkin(level = profile?.level) {
  return PET_SKIN_BY_ID.get(activePetSkinId(level)) || PET_SKINS[0];
}

function petSkinAssetUrl(level, skinId = selectedPetSkin) {
  const safeLevel = Math.min(Math.max(1, Number(level || 1)), 10);
  const normalizedSkinId = safeLevel >= 2 ? normalizePetSkin(skinId) : "normal";
  const skin = PET_SKIN_BY_ID.get(normalizedSkinId) || PET_SKINS[0];
  return `${skin.assetBase}/level-${String(safeLevel).padStart(2, "0")}.png`;
}

function petSkinSelectorHTML() {
  const level = Number(profile?.level || 1);
  if (level < 2) return "";
  const activeSkin = activePetSkinId(level);
  return `
    <div class="pet-skin-switcher" aria-label="切换刘看山皮肤">
      ${PET_SKINS.map((skin) => `
        <button
          type="button"
          class="${skin.id === activeSkin ? "active" : ""}"
          data-pet-skin="${escapeHTML(skin.id)}"
          data-tone="${escapeHTML(skin.tone)}"
          aria-pressed="${skin.id === activeSkin ? "true" : "false"}">
          ${escapeHTML(skin.label)}
        </button>
      `).join("")}
    </div>
  `;
}

function petSkinGuideHTML() {
  const level = Number(profile?.level || 1);
  const skinNames = PET_SKINS.map((skin) => skin.label).join("、");
  if (level < 2) {
    return `
      <div class="pet-skin-guide">
        升到 <strong>Lv.2</strong> 后解锁 ${escapeHTML(skinNames)} 三套 2D 皮肤。
      </div>
    `;
  }
  return `
    <div class="pet-skin-guide unlocked">
      <strong>Lv.2 皮肤已解锁</strong>，可在上方切换 ${escapeHTML(skinNames)} 形象。
    </div>
  `;
}

function switchPetSkin(skinId) {
  const nextSkin = normalizePetSkin(skinId);
  if (Number(profile?.level || 1) < 2) return;
  selectedPetSkin = nextSkin;
  localStorage.setItem("liukanshan_pet_skin", selectedPetSkin);
  renderPetHoverCard();
  replacePetPanels();
  showToast(`已切换为${activePetSkin().label}形象`);
}

function currentLevelVisual() {
  if (!profile?.adopted) return null;
  const skin = activePetSkin(profile.level);
  const imageUrl = petSkinAssetUrl(profile.level, skin.id);
  return {
    level: profile.level,
    imageUrl,
    thumbnailUrl: imageUrl,
    title: profile.levelTitle,
    effectStyle: profile.levelEffectStyle || "cute",
    shareBgImage: profile.shareBgImage,
    description: profile.levelVisualDescription,
    skinId: skin.id,
    skinLabel: skin.label,
  };
}

async function loadLevelVisuals() {
  if (levelVisuals) return levelVisuals;
  if (levelVisualsPromise) return levelVisualsPromise;
  levelVisualsPromise = api("/api/p1/pet/level-visuals")
    .then((data) => {
      levelVisuals = data.visuals || [];
      return levelVisuals;
    })
    .finally(() => {
      levelVisualsPromise = null;
    });
  return levelVisualsPromise;
}

function visualForLevel(level) {
  const safeLevel = Math.max(1, Number(level || 1));
  const visuals = levelVisuals || [];
  const visual = [...visuals]
    .filter((item) => Number(item.level) <= safeLevel)
    .sort((a, b) => Number(b.level) - Number(a.level))[0] || null;
  if (!visual) return null;
  const skin = activePetSkin(safeLevel);
  const imageUrl = petSkinAssetUrl(safeLevel, skin.id);
  return {
    ...visual,
    imageUrl,
    thumbnailUrl: imageUrl,
    skinId: skin.id,
    skinLabel: skin.label,
  };
}

function levelRequirementRows() {
  const rows = (levelVisuals?.length ? levelVisuals : FALLBACK_LEVEL_REQUIREMENTS)
    .map((item) => ({
      level: Number(item.level),
      title: item.title || `Lv.${item.level}`,
      requiredTotalExp: Number(item.requiredTotalExp ?? item.required_total_exp ?? 0),
    }))
    .filter((item) => Number.isFinite(item.level) && Number.isFinite(item.requiredTotalExp))
    .sort((a, b) => a.level - b.level);
  return rows.length ? rows : FALLBACK_LEVEL_REQUIREMENTS;
}

function levelProgressInfo() {
  if (!profile?.adopted) return null;
  const rows = levelRequirementRows();
  const currentLevel = Number(profile.level || 1);
  const totalExp = Number(profile.totalExp || 0);
  const current = [...rows].reverse().find((item) => item.level <= currentLevel) || rows[0];
  const next = rows.find((item) => item.level > currentLevel);
  if (!next) {
    return {
      isMaxLevel: true,
      percent: 100,
      summary: "已满级，继续探索知乎星",
    };
  }
  const currentRequired = Number(current?.requiredTotalExp || 0);
  const nextRequired = Number(next.requiredTotalExp || 0);
  const span = Math.max(1, nextRequired - currentRequired);
  const gained = Math.min(span, Math.max(0, totalExp - currentRequired));
  const remaining = Math.max(0, nextRequired - totalExp);
  return {
    isMaxLevel: false,
    nextLevel: next.level,
    nextTitle: next.title,
    remaining,
    percent: Math.max(0, Math.min(100, Math.round((gained / span) * 100))),
    summary: remaining > 0
      ? `还差 ${remaining} 经验升 Lv.${next.level}「${next.title}」`
      : `即将晋升 Lv.${next.level}「${next.title}」`,
  };
}

function levelProgressHTML(compact = false) {
  const info = levelProgressInfo();
  if (!info) return "";
  return `
    <span class="${compact ? "level-progress-note compact" : "level-progress-note"}">${escapeHTML(info.summary)}</span>
    <span class="level-progress-track" aria-hidden="true">
      <span style="width:${info.percent}%"></span>
    </span>
  `;
}

function effectStageCenter() {
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight * 0.64,
  };
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

function clearCharacterEffectTimers() {
  window.clearTimeout(homecomingReturnTimer);
  window.clearTimeout(levelUpReturnTimer);
  window.clearTimeout(levelEndingTimer);
  window.clearTimeout(travelAnimationTimer);
  homecomingReturnTimer = null;
  levelUpReturnTimer = null;
  levelEndingTimer = null;
  travelAnimationTimer = null;
}

function playHomecomingEffect() {
  clearCharacterEffectTimers();
  const milestone = LEVEL_MILESTONES[1];
  const layer = effectLayer();
  const card = document.createElement("div");
  card.className = "pet-home-card";
  card.innerHTML = `<strong>Lv.1 · ${escapeHTML(milestone.title)}</strong><span>${escapeHTML(milestone.quote)}</span>`;
  layer.appendChild(card);
  removeAfter(card, ADOPTION_EFFECT_MS + EFFECT_SETTLE_MS);

  const { x: centerX, y: centerY } = effectStageCenter();
  character?.setPosition(centerX, centerY);
  character?.playSpawnEffect({
    message: "我回家啦，以后一起看知乎~",
    duration: ADOPTION_EFFECT_MS,
    particleCount: 156,
    scaleMultiplier: 1.34,
  });
  pulseCharacter("pet-homecoming", ADOPTION_EFFECT_MS);
  spawnSparks(centerX, centerY, { count: 18 });
  spawnRing(centerX, centerY, false);

  homecomingReturnTimer = window.setTimeout(() => {
    character?.moveTo(window.innerWidth - 150, window.innerHeight - 200, {
      message: profileBubbleTitle(),
      useRandomMessage: false,
    });
    homecomingReturnTimer = null;
  }, ADOPTION_EFFECT_MS + EFFECT_SETTLE_MS);
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

function defaultOnboardingState() {
  return {
    version: ONBOARDING_VERSION,
    skipped: false,
    firstConsumeDone: false,
    firstInteractDone: false,
    travelSeen: false,
    growthLogSeen: false,
    leaderboardSeen: false,
  };
}

function getOnboardingState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ONBOARDING_KEY) || "{}");
    return { ...defaultOnboardingState(), ...parsed, version: ONBOARDING_VERSION };
  } catch {
    return defaultOnboardingState();
  }
}

function saveOnboardingState(nextState) {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ ...defaultOnboardingState(), ...nextState }));
}

function markOnboardingStep(stepKey) {
  const state = getOnboardingState();
  if (state.skipped) return;
  const fieldMap = {
    consume: "firstConsumeDone",
    interact: "firstInteractDone",
    travel: "travelSeen",
    growthLog: "growthLogSeen",
    leaderboard: "leaderboardSeen",
  };
  const field = fieldMap[stepKey];
  if (!field || state[field]) return;
  saveOnboardingState({ ...state, [field]: true });
  trackEvent("onboarding_step_done", {
    targetType: "onboarding",
    targetId: stepKey,
    props: { stepKey },
  });
  scheduleOnboardingGuide(300);
}

function onboardingSteps() {
  return [
    {
      id: "login",
      index: 1,
      title: "先登录知乎",
      body: "登录后就能领养刘看山，把阅读和互动变成成长值。",
      primaryText: "登录知乎",
      target: ".login-primary",
      action: "login",
      placement: "center",
    },
    {
      id: "adopt",
      index: 2,
      title: "领养刘看山",
      body: "先把刘看山领回家，后续阅读、点赞、收藏和评论才会转化为成长。",
      primaryText: "去领养",
      target: "[data-adopt]",
      route: "/people/p2wcex",
      action: "adopt",
      placement: "center",
    },
    {
      id: "consume",
      index: 3,
      title: "阅读一条推荐",
      body: "打开推荐内容全文，文章、想法、视频和小说都会给看山加经验。",
      note: "同一篇内容的阅读奖励只发一次，重复打开不会反复增加经验。",
      primaryText: "去推荐页",
      target: "[data-open-content]",
      route: "/",
    },
    {
      id: "interact",
      index: 4,
      title: "完成一次互动",
      body: "点赞、收藏或评论会提升心情，也会记录在成长日志里。",
      note: "同一内容的同一互动只记录一次，重复点击不会增加成长经验。",
      primaryText: "去互动",
      target: "[data-interact]",
      route: "/",
    },
    {
      id: "travel",
      index: 5,
      title: "认识游历入口",
      body: "悬浮刘看山可以看到游历、手账、成长日志和排行榜。",
      note: "提示卡会避开右下角的 3D 看山，不会挡住模型操作。",
      primaryText: "我知道了",
      target: "#roamingCharacter",
      action: "travel",
    },
    {
      id: "growthLog",
      index: 6,
      title: "查看成长日志",
      body: "每次成长和衰减都会记录下来，方便回看最近的变化。",
      primaryText: "打开日志",
      target: "[data-hover-growth-log]",
      action: "growthLog",
    },
    {
      id: "leaderboard",
      index: 7,
      title: "看看排行榜",
      body: "等级榜和游历榜会展示大家的看山成长进度。",
      primaryText: "去推荐页",
      target: "[data-open-leaderboard]",
      route: "/",
      action: "leaderboard",
    },
  ];
}

function currentOnboardingStep() {
  const state = getOnboardingState();
  if (state.skipped) return null;
  if (!currentUser) return onboardingSteps()[0];
  if (!profile?.adopted) return onboardingSteps()[1];
  if (!state.firstConsumeDone) return onboardingSteps()[2];
  if (!state.firstInteractDone) return onboardingSteps()[3];
  if (!state.travelSeen) return onboardingSteps()[4];
  if (!state.growthLogSeen) return onboardingSteps()[5];
  if (!state.leaderboardSeen) return onboardingSteps()[6];
  return null;
}

function removeOnboardingGuide() {
  document.querySelector(".onboarding-guide")?.remove();
  document.querySelectorAll(".onboarding-highlight").forEach((element) => {
    element.classList.remove("onboarding-highlight");
  });
}

function storyIntroKey() {
  const userKey = currentUser?.userToken || currentUser?.uid || currentUser?.userId || "guest";
  return `liukanshan_story_intro_${STORY_INTRO_VERSION}_${userKey}`;
}

function hasSeenStoryIntro() {
  return localStorage.getItem(storyIntroKey()) === "1";
}

function markStoryIntroSeen() {
  localStorage.setItem(storyIntroKey(), "1");
}

function resetStoryIntroSeen() {
  localStorage.removeItem(storyIntroKey());
}

function clearStoryTypingTimer() {
  if (storyIntroTypingTimer) {
    window.clearInterval(storyIntroTypingTimer);
    storyIntroTypingTimer = null;
  }
}

function clearStoryComicState() {
  if (!storyIntroComicState) return;
  storyIntroComicState.cancelled = true;
  window.clearTimeout(storyIntroComicState.timer);
  storyIntroComicState.animation?.cancel();
  storyIntroComicState.resolveWait?.();
  storyIntroComicState = null;
}

function clearLevelEndingComicState() {
  if (!levelEndingComicState) return;
  levelEndingComicState.cancelled = true;
  window.clearTimeout(levelEndingComicState.timer);
  levelEndingComicState.animation?.cancel();
  levelEndingComicState.resolveWait?.();
  levelEndingComicState = null;
}

function clearStoryScrollState() {
  if (!storyIntroScrollState) return;
  storyIntroScrollState.cancelled = true;
  storyIntroScrollState.timeline?.kill();
  storyIntroScrollState.ticker?.();
  storyIntroScrollState.resize?.();
  storyIntroScrollState.renderer?.dispose();
  storyIntroScrollState.materials?.forEach((material) => material.dispose());
  storyIntroScrollState.geometries?.forEach((geometry) => geometry.dispose());
  storyIntroScrollState.textures?.forEach((texture) => texture.dispose());
  storyIntroScrollState = null;
}

function closeStoryIntro(markSeen = true) {
  clearStoryTypingTimer();
  clearStoryComicState();
  clearStoryScrollState();
  document.querySelector(".story-intro-modal")?.remove();
  if (markSeen) markStoryIntroSeen();
  scheduleOnboardingGuide(320);
}

function typeStoryText(target, text, done) {
  clearStoryTypingTimer();
  let index = 0;
  target.textContent = "";
  storyIntroTypingTimer = window.setInterval(() => {
    index += 1;
    target.textContent = text.slice(0, index);
    if (index >= text.length) {
      clearStoryTypingTimer();
      done?.();
    }
  }, 38);
}

function storyComicDuration(ms) {
  return storyIntroComicState?.fast ? Math.max(160, Math.round(ms * 0.32)) : ms;
}

function waitStoryComic(ms) {
  const state = storyIntroComicState;
  if (!state?.fast) {
    return new Promise((resolve) => {
      state.resolveWait = () => {
        state.resolveWait = null;
        window.clearTimeout(state.timer);
        resolve();
      };
      state.timer = window.setTimeout(state.resolveWait, ms);
    });
  }
  return new Promise((resolve) => {
    state.timer = window.setTimeout(resolve, storyComicDuration(ms));
  });
}

function accelerateStoryComic() {
  const state = storyIntroComicState;
  if (!state || state.finished) return;
  state.fast = true;
  state.animation?.updatePlaybackRate?.(3.4);
  state.resolveWait?.();
}

async function playStoryAnimation(animation) {
  const state = storyIntroComicState;
  if (!state || state.cancelled) return;
  state.animation = animation;
  if (state.fast) animation.updatePlaybackRate?.(3.4);
  try {
    await animation.finished;
  } catch {
    return;
  } finally {
    animation.cancel();
    if (state.animation === animation) state.animation = null;
  }
}

async function decodeStoryImage(img) {
  try {
    if (img.decode) await img.decode();
  } catch {
    return;
  }
}

async function playStoryComicFrame(modal, frame, index) {
  const state = storyIntroComicState;
  const grid = modal.querySelector("[data-comic-grid]");
  const focus = modal.querySelector("[data-comic-focus]");
  const img = modal.querySelector("[data-comic-image]");
  if (!state || state.cancelled || !grid || !focus || !img) return;

  const thumb = document.createElement("article");
  thumb.className = "story-comic-thumb is-pending";
  thumb.innerHTML = `
    <img src="${escapeHTML(frame.image)}" alt="${escapeHTML(frame.alt)}">
    <span>${index + 1}</span>
  `;
  grid.appendChild(thumb);

  img.src = frame.image;
  img.alt = frame.alt;
  modal.style.setProperty("--story-comic-bg", `url("${frame.image}")`);
  modal.classList.add("has-extended-bg");
  await decodeStoryImage(img);
  if (state.cancelled || !modal.isConnected) return;

  focus.hidden = false;
  focus.className = "story-comic-focus";
  focus.removeAttribute("style");
  await playStoryAnimation(focus.animate([
    { opacity: 0, transform: "translate(-50%, -42%) scale(0.84)" },
    { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
  ], {
    duration: storyComicDuration(520),
    easing: "cubic-bezier(.18,.82,.22,1)",
    fill: "both",
  }));
  if (state.cancelled || !modal.isConnected) return;

  focus.classList.add("is-breathing");
  await waitStoryComic(1200);
  if (state.cancelled || !modal.isConnected) return;

  focus.classList.remove("is-breathing");
  const from = focus.getBoundingClientRect();
  const to = thumb.getBoundingClientRect();
  focus.classList.add("is-moving");
  Object.assign(focus.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    transform: "none",
    overflow: "hidden",
  });
  await playStoryAnimation(focus.animate([
    {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      opacity: 1,
    },
    {
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      opacity: 0.82,
    },
  ], {
    duration: storyComicDuration(520),
    easing: "cubic-bezier(.22,.82,.2,1)",
    fill: "both",
  }));
  if (state.cancelled || !modal.isConnected) return;

  thumb.classList.remove("is-pending");
  thumb.classList.add("is-visible");
  focus.hidden = true;
  focus.className = "story-comic-focus";
  focus.removeAttribute("style");
}

async function playStoryComic(modal) {
  storyIntroComicState = {
    cancelled: false,
    fast: false,
    finished: false,
    timer: null,
    animation: null,
    resolveWait: null,
  };
  for (let index = 0; index < STORY_COMIC_FRAMES.length; index += 1) {
    await playStoryComicFrame(modal, STORY_COMIC_FRAMES[index], index);
    if (!storyIntroComicState || storyIntroComicState.cancelled || !modal.isConnected) return;
  }
  const final = modal.querySelector("[data-comic-final]");
  if (!final || !storyIntroComicState) return;
  storyIntroComicState.finished = true;
  modal.style.setProperty("--story-comic-bg", `url("${STORY_COMIC_AGGREGATE_IMAGE}")`);
  final.hidden = false;
  final.animate([
    { opacity: 0, transform: "translate(-50%, 18px) scale(0.94)" },
    { opacity: 1, transform: "translate(-50%, 0) scale(1)" },
  ], {
    duration: 420,
    easing: "cubic-bezier(.18,.82,.22,1)",
    fill: "both",
  });
}

function showComicStoryIntro() {
  removeOnboardingGuide();
  const modal = document.createElement("div");
  modal.className = "story-intro-modal story-comic-modal";
  modal.innerHTML = `
    <section class="story-comic-dialog" role="dialog" aria-modal="true" aria-label="刘看山背景故事漫剧">
      <div class="story-comic-extended-bg" aria-hidden="true"></div>
      <div class="story-comic-grid" data-comic-grid aria-label="背景故事分镜"></div>
      <figure class="story-comic-focus" data-comic-focus hidden>
        <div class="story-comic-frame">
          <img data-comic-image alt="">
        </div>
      </figure>
      <div class="story-comic-final" data-comic-final hidden>
        <button type="button" class="story-primary story-comic-adopt" data-story-adopt>领养刘看山</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-story-adopt]")) return;
    accelerateStoryComic();
  });
  modal.querySelector("[data-story-adopt]").addEventListener("click", () => {
    markStoryIntroSeen();
    adoptPet();
  });
  playStoryComic(modal);
  return true;
}

function levelEndingComicDuration(ms) {
  return levelEndingComicState?.fast ? Math.max(160, Math.round(ms * 0.32)) : ms;
}

function waitLevelEndingComic(ms) {
  const state = levelEndingComicState;
  if (!state?.fast) {
    return new Promise((resolve) => {
      state.resolveWait = () => {
        state.resolveWait = null;
        window.clearTimeout(state.timer);
        resolve();
      };
      state.timer = window.setTimeout(state.resolveWait, ms);
    });
  }
  return new Promise((resolve) => {
    state.timer = window.setTimeout(resolve, levelEndingComicDuration(ms));
  });
}

function accelerateLevelEndingComic() {
  const state = levelEndingComicState;
  if (!state || state.finished) return;
  state.fast = true;
  state.animation?.updatePlaybackRate?.(3.4);
  state.resolveWait?.();
}

async function playLevelEndingAnimation(animation) {
  const state = levelEndingComicState;
  if (!state || state.cancelled) return;
  state.animation = animation;
  if (state.fast) animation.updatePlaybackRate?.(3.4);
  try {
    await animation.finished;
  } catch {
    return;
  } finally {
    animation.cancel();
    if (state.animation === animation) state.animation = null;
  }
}

async function playLevelEndingComicFrame(modal, frame, index) {
  const state = levelEndingComicState;
  const grid = modal.querySelector("[data-comic-grid]");
  const focus = modal.querySelector("[data-comic-focus]");
  const img = modal.querySelector("[data-comic-image]");
  if (!state || state.cancelled || !grid || !focus || !img) return;

  const thumb = document.createElement("article");
  thumb.className = "story-comic-thumb is-pending";
  thumb.innerHTML = `
    <img src="${escapeHTML(frame.image)}" alt="${escapeHTML(frame.alt)}">
    <span>${index + 1}</span>
  `;
  grid.appendChild(thumb);

  img.src = frame.image;
  img.alt = frame.alt;
  modal.style.setProperty("--story-comic-bg", `url("${frame.image}")`);
  modal.classList.add("has-extended-bg");
  await decodeStoryImage(img);
  if (state.cancelled || !modal.isConnected) return;

  focus.hidden = false;
  focus.className = "story-comic-focus";
  focus.removeAttribute("style");
  await playLevelEndingAnimation(focus.animate([
    { opacity: 0, transform: "translate(-50%, -42%) scale(0.84)" },
    { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
  ], {
    duration: levelEndingComicDuration(520),
    easing: "cubic-bezier(.18,.82,.22,1)",
    fill: "both",
  }));
  if (state.cancelled || !modal.isConnected) return;

  focus.classList.add("is-breathing");
  await waitLevelEndingComic(1200);
  if (state.cancelled || !modal.isConnected) return;

  focus.classList.remove("is-breathing");
  const from = focus.getBoundingClientRect();
  const to = thumb.getBoundingClientRect();
  focus.classList.add("is-moving");
  Object.assign(focus.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    transform: "none",
    overflow: "hidden",
  });
  await playLevelEndingAnimation(focus.animate([
    {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      opacity: 1,
    },
    {
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      opacity: 0.82,
    },
  ], {
    duration: levelEndingComicDuration(520),
    easing: "cubic-bezier(.22,.82,.2,1)",
    fill: "both",
  }));
  if (state.cancelled || !modal.isConnected) return;

  thumb.classList.remove("is-pending");
  thumb.classList.add("is-visible");
  focus.hidden = true;
  focus.className = "story-comic-focus";
  focus.removeAttribute("style");
}

async function playLevelEndingComic(modal) {
  levelEndingComicState = {
    cancelled: false,
    fast: false,
    finished: false,
    timer: null,
    animation: null,
    resolveWait: null,
  };
  for (let index = 0; index < LEVEL_ENDING_COMIC_FRAMES.length; index += 1) {
    await playLevelEndingComicFrame(modal, LEVEL_ENDING_COMIC_FRAMES[index], index);
    if (!levelEndingComicState || levelEndingComicState.cancelled || !modal.isConnected) return;
  }
  const final = modal.querySelector("[data-comic-final]");
  if (!final || !levelEndingComicState) return;
  levelEndingComicState.finished = true;
  modal.style.setProperty("--story-comic-bg", `url("${LEVEL_ENDING_COMIC_AGGREGATE_IMAGE}")`);
  final.hidden = false;
  final.animate([
    { opacity: 0, transform: "translate(-50%, 18px) scale(0.94)" },
    { opacity: 1, transform: "translate(-50%, 0) scale(1)" },
  ], {
    duration: 420,
    easing: "cubic-bezier(.18,.82,.22,1)",
    fill: "both",
  });
}

const STORY_SCROLL_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STORY_SCROLL_FRAGMENT_SHADER = `
  uniform sampler2D uTexture;
  uniform float uDissolve;
  uniform float uOpacity;
  uniform float uScroll;
  uniform float uTime;
  varying vec2 vUv;

  float random(vec2 value) {
    return fract(sin(dot(value, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv;
    uv.y += uScroll * 0.035;
    vec4 color = texture2D(uTexture, uv);
    float wave = sin((uv.y + uTime * 0.18) * 26.0) * 0.055;
    float noise = random(floor(uv * 78.0)) + wave;
    float mask = smoothstep(uDissolve - 0.18, uDissolve + 0.18, noise);
    gl_FragColor = vec4(color.rgb, color.a * uOpacity * mask);
  }
`;

function storyScrollPlaneSize(texture) {
  const image = texture.image || {};
  const ratio = image.width && image.height ? image.width / image.height : 0.885;
  const height = window.innerWidth <= 640 ? 1.02 : 1.18;
  return { width: height * ratio, height };
}

function storyScrollMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: texture },
      uDissolve: { value: 1.2 },
      uOpacity: { value: 0 },
      uScroll: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: STORY_SCROLL_VERTEX_SHADER,
    fragmentShader: STORY_SCROLL_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
}

function updateStoryScrollLayout(state) {
  if (!state?.renderer || !state.camera || !state.canvas) return;
  const rect = state.canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const aspect = width / height;
  state.camera.left = -aspect;
  state.camera.right = aspect;
  state.camera.top = 1;
  state.camera.bottom = -1;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(width, height, false);
}

async function createStoryScrollState(modal) {
  const canvas = modal.querySelector("[data-scroll-canvas]");
  const captionTitle = modal.querySelector("[data-scroll-title]");
  const captionDescription = modal.querySelector("[data-scroll-description]");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 3;
  const textureLoader = new THREE.TextureLoader();
  const textures = await Promise.all(STORY_COMIC_FRAMES.map((frame) => textureLoader.loadAsync(frame.image)));
  textures.forEach((texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
  });
  const materials = [];
  const geometries = [];
  const meshes = textures.map((texture) => {
    const size = storyScrollPlaneSize(texture);
    const geometry = new THREE.PlaneGeometry(size.width, size.height, 48, 48);
    const material = storyScrollMaterial(texture);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    scene.add(mesh);
    materials.push(material);
    geometries.push(geometry);
    return mesh;
  });
  const state = {
    cancelled: false,
    finished: false,
    fast: false,
    canvas,
    scene,
    camera,
    renderer,
    textures,
    materials,
    geometries,
    meshes,
    captionTitle,
    captionDescription,
    timeline: null,
    ticker: null,
    resize: null,
  };
  updateStoryScrollLayout(state);
  const render = () => {
    const time = performance.now() / 1000;
    materials.forEach((material) => {
      material.uniforms.uTime.value = time;
    });
    renderer.render(scene, camera);
  };
  gsap.ticker.add(render);
  state.ticker = () => gsap.ticker.remove(render);
  const onResize = () => updateStoryScrollLayout(state);
  window.addEventListener("resize", onResize);
  state.resize = () => window.removeEventListener("resize", onResize);
  return state;
}

function updateStoryScrollFrame(state, mesh, progress) {
  mesh.position.y = progress.y;
  mesh.rotation.z = progress.rotate;
  mesh.material.uniforms.uOpacity.value = progress.opacity;
  mesh.material.uniforms.uDissolve.value = progress.dissolve;
  mesh.material.uniforms.uScroll.value = progress.scroll;
}

function buildStoryScrollTimeline(modal, state) {
  const timeline = gsap.timeline({
    defaults: { ease: "power2.inOut" },
    onComplete: () => finishStoryScroll(modal),
  });
  STORY_COMIC_FRAMES.forEach((frame, index) => {
    const direction = index % 2 === 0 ? 1 : -1;
    const mesh = state.meshes[index];
    const progress = {
      y: direction * 1.72,
      rotate: direction * 0.035,
      opacity: 0,
      dissolve: 1.18,
      scroll: 0,
    };
    timeline.call(() => {
      state.captionTitle.textContent = frame.title || frame.alt || "";
      state.captionDescription.textContent = frame.description || "";
      modal.classList.remove("is-final");
      mesh.visible = true;
      updateStoryScrollFrame(state, mesh, progress);
    });
    timeline.to(progress, {
      y: 0,
      rotate: 0,
      opacity: 1,
      dissolve: -0.18,
      scroll: direction * 1.2,
      duration: 1.25,
      onUpdate: () => updateStoryScrollFrame(state, mesh, progress),
    });
    timeline.to(progress, {
      scroll: direction * 1.55,
      duration: 0.88,
      ease: "none",
      onUpdate: () => updateStoryScrollFrame(state, mesh, progress),
    });
    timeline.to(progress, {
      y: direction * -1.72,
      rotate: direction * -0.04,
      opacity: 0,
      dissolve: 1.18,
      scroll: direction * 2.8,
      duration: 1.05,
      onUpdate: () => updateStoryScrollFrame(state, mesh, progress),
      onComplete: () => {
        mesh.visible = false;
      },
    });
  });
  return timeline;
}

function accelerateStoryScroll() {
  const state = storyIntroScrollState;
  if (!state || state.finished) return;
  state.fast = true;
  state.timeline?.timeScale(3.2);
}

function finishStoryScroll(modal) {
  const state = storyIntroScrollState;
  if (!state || state.cancelled || !modal.isConnected) return;
  state.finished = true;
  modal.classList.add("is-final");
  state.meshes.forEach((mesh) => {
    mesh.visible = false;
  });
  const final = modal.querySelector("[data-scroll-final]");
  if (!final) return;
  final.hidden = false;
  gsap.fromTo(final, {
    autoAlpha: 0,
    y: 22,
    scale: 0.94,
  }, {
    autoAlpha: 1,
    y: 0,
    scale: 1,
    duration: 0.58,
    ease: "back.out(1.35)",
  });
}

function showScrollStoryIntro() {
  removeOnboardingGuide();
  const modal = document.createElement("div");
  modal.className = "story-intro-modal story-scroll-modal";
  modal.innerHTML = `
    <section class="story-scroll-dialog" role="dialog" aria-modal="true" aria-label="刘看山背景故事滚动溶解">
      <canvas class="story-scroll-canvas" data-scroll-canvas aria-hidden="true"></canvas>
      <div class="story-scroll-caption" data-scroll-caption>
        <strong data-scroll-title></strong>
        <span data-scroll-description></span>
      </div>
      <div class="story-scroll-final" data-scroll-final hidden>
        <img src="${escapeHTML(STORY_COMIC_AGGREGATE_IMAGE)}" alt="刘看山背景故事八格漫剧">
        <button type="button" class="story-primary story-scroll-adopt" data-story-adopt>领养刘看山</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-story-adopt]")) return;
    accelerateStoryScroll();
  });
  modal.querySelector("[data-story-adopt]").addEventListener("click", () => {
    markStoryIntroSeen();
    adoptPet();
  });
  createStoryScrollState(modal)
    .then((state) => {
      if (!modal.isConnected) {
        state.renderer.dispose();
        return;
      }
      storyIntroScrollState = state;
      state.timeline = buildStoryScrollTimeline(modal, state);
    })
    .catch((error) => {
      console.warn("Story scroll intro failed", error);
      closeStoryIntro(false);
      showComicStoryIntro();
    });
  return true;
}

function showTextStoryIntro() {
  removeOnboardingGuide();
  const modal = document.createElement("div");
  modal.className = "story-intro-modal";
  modal.innerHTML = `
    <section class="story-intro-dialog" role="dialog" aria-modal="true" aria-label="刘看山背景故事">
      <div class="story-orbit" aria-hidden="true"></div>
      <h1>知乎星等待重新点亮</h1>
      <p class="story-typewriter" data-story-text></p>
      <div class="story-actions" data-story-actions hidden>
        <button type="button" class="story-primary" data-story-adopt>领养刘看山</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  const textNode = modal.querySelector("[data-story-text]");
  const actions = modal.querySelector("[data-story-actions]");
  typeStoryText(textNode, STORY_INTRO_TEXT, () => {
    actions.hidden = false;
  });
  modal.querySelector("[data-story-adopt]").addEventListener("click", () => {
    markStoryIntroSeen();
    adoptPet();
  });
  return true;
}

function maybeShowStoryIntro() {
  if (!currentUser || profile?.adopted || document.querySelector(".story-intro-modal")) {
    return false;
  }
  return showComicStoryIntro();
}

function hasOnboardingBlockingOverlay() {
  return Boolean(document.querySelector(ONBOARDING_BLOCKING_SELECTOR));
}

function closeBlockingModal(modal) {
  modal?.remove();
  scheduleOnboardingGuide(260);
}

function isElementUncovered(element) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const fullyOutsideViewport = rect.bottom < 0 || rect.top > viewportHeight || rect.right < 0 || rect.left > viewportWidth;
  if (fullyOutsideViewport) return true;
  const samplePoints = [
    [rect.left + rect.width / 2, rect.top + rect.height / 2],
    [rect.left + rect.width * 0.2, rect.top + rect.height * 0.2],
    [rect.right - rect.width * 0.2, rect.bottom - rect.height * 0.2],
  ];
  return samplePoints.some(([x, y]) => {
    if (x < 0 || y < 0 || x > viewportWidth || y > viewportHeight) return false;
    const topElement = document.elementFromPoint(x, y);
    return topElement && (element === topElement || element.contains(topElement));
  });
}

function highlightOnboardingTarget(step) {
  document.querySelectorAll(".onboarding-highlight").forEach((element) => {
    element.classList.remove("onboarding-highlight");
  });
  if (!step?.target) return;
  const target = [...document.querySelectorAll(step.target)].find((element) => {
    if (element.disabled) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && isElementUncovered(element);
  });
  if (!target) return;
  target.classList.add("onboarding-highlight");
  const rect = target.getBoundingClientRect();
  const visible = rect.top >= 72 && rect.bottom <= window.innerHeight - 88;
  if (!visible) {
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function rectsOverlap(a, b, gap = 10) {
  if (!a || !b) return false;
  return a.left < b.right + gap
    && a.right > b.left - gap
    && a.top < b.bottom + gap
    && a.bottom > b.top - gap;
}

function visibleRect(selector) {
  const element = [...document.querySelectorAll(selector)].find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  return element?.getBoundingClientRect() || null;
}

function avoidOnboardingOverlap(guide, step) {
  if (!guide || step?.placement === "center" || window.innerWidth <= 720) return;
  const guideRect = guide.getBoundingClientRect();
  const modelRect = visibleRect("#roamingCharacter");
  const targetRect = step?.target ? visibleRect(step.target) : null;
  if (rectsOverlap(guideRect, modelRect, 18) || rectsOverlap(guideRect, targetRect, 18)) {
    guide.classList.add("placement-top-left");
  }
}

function renderOnboardingGuide(step) {
  removeOnboardingGuide();
  if (!step || hasOnboardingBlockingOverlay()) return;
  const guide = document.createElement("div");
  guide.className = `onboarding-guide step-${step.id} placement-${step.placement || "side"}`;
  guide.setAttribute("role", "dialog");
  guide.setAttribute("aria-label", "新手引导");
  guide.innerHTML = `
    <div class="onboarding-guide-card">
      <button class="onboarding-close" data-onboarding-later aria-label="稍后再看">×</button>
      <div class="onboarding-kicker">新手引导 ${step.index}/7</div>
      <h2>${escapeHTML(step.title)}</h2>
      <p>${escapeHTML(step.body)}</p>
      ${step.note ? `<div class="onboarding-note">${escapeHTML(step.note)}</div>` : ""}
      <div class="onboarding-progress" aria-hidden="true">
        ${onboardingSteps().map((item) => `<span class="${item.index <= step.index ? "active" : ""}"></span>`).join("")}
      </div>
      <div class="onboarding-actions">
        <button class="onboarding-skip" data-onboarding-skip>跳过引导</button>
        <button class="onboarding-primary" data-onboarding-primary>${escapeHTML(step.primaryText)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(guide);
  trackEvent("onboarding_step_show", {
    targetType: "onboarding",
    targetId: step.id,
    props: { stepId: step.id, stepIndex: step.index },
  });
  guide.querySelector("[data-onboarding-later]").addEventListener("click", () => {
    onboardingSnoozedUntil = Date.now() + 3 * 60 * 1000;
    removeOnboardingGuide();
  });
  guide.querySelector("[data-onboarding-skip]").addEventListener("click", () => {
    trackEvent("onboarding_skip", {
      targetType: "onboarding",
      targetId: step.id,
      props: { stepId: step.id, stepIndex: step.index },
      immediate: true,
    });
    saveOnboardingState({ ...getOnboardingState(), skipped: true });
    removeOnboardingGuide();
    showToast("已跳过新手引导");
  });
  guide.querySelector("[data-onboarding-primary]").addEventListener("click", () => {
    handleOnboardingPrimary(step);
  });
  window.requestAnimationFrame(() => {
    avoidOnboardingOverlap(guide, step);
    highlightOnboardingTarget(step);
  });
}

function routeTo(path) {
  if (!path || window.location.pathname === path) return false;
  window.history.pushState({}, "", path);
  renderCurrentRoute();
  return true;
}

function handleOnboardingPrimary(step) {
  if (step.action === "login") {
    const next = encodeURIComponent(window.location.pathname || "/");
    window.location.href = `/auth/login?next=${next}`;
    return;
  }
  if (step.action === "adopt") {
    if (routeTo(step.route)) return;
    document.querySelector("[data-adopt]")?.click();
    return;
  }
  if (step.action === "travel") {
    markOnboardingStep("travel");
    character?.setMessage?.("悬浮我，可以看到游历和成长菜单~", { autoHide: 3200 });
    showToast("游历入口在刘看山的悬浮菜单里");
    return;
  }
  if (step.action === "growthLog") {
    openGrowthLog();
    return;
  }
  if (step.action === "leaderboard") {
    if (routeTo(step.route)) return;
    markOnboardingStep("leaderboard");
    return;
  }
  if (step.route) {
    routeTo(step.route);
    scheduleOnboardingGuide(380);
  }
}

function scheduleOnboardingGuide(delay = 220) {
  window.clearTimeout(onboardingTimer);
  onboardingTimer = window.setTimeout(() => {
    if (Date.now() < onboardingSnoozedUntil) return;
    if (hasOnboardingBlockingOverlay()) {
      removeOnboardingGuide();
      scheduleOnboardingGuide(800);
      return;
    }
    renderOnboardingGuide(currentOnboardingStep());
  }, delay);
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
  const { x: centerX, y: centerY } = effectStageCenter();
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
      duration: ADOPTION_EFFECT_MS,
      particleCount: 156,
      scaleMultiplier: 1.34,
    });
    pulseCharacter("pet-homecoming", ADOPTION_EFFECT_MS);
    showToast("触发领养出场");
    return;
  }

  if (action === "evolve") {
    centerCharacterForTest();
    pet.playEvolveEffect?.({ message: "看山升级啦！✨", autoHide: LEVEL_UP_EFFECT_MS });
    pulseCharacter("pet-level-up", LEVEL_UP_EFFECT_MS);
    showToast("触发升级进化");
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
    pet.setMessage(profileBubbleTitle(), { autoHide: 1800 });
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
      <button data-effect-test="exp">经验获得</button>
      <button data-effect-test="bubble">文字气泡</button>
      <button data-effect-test="emoji">Emoji</button>
      <button data-effect-test="wave">挥手</button>
      <button data-effect-test="travel-go">旅行出发</button>
      <button data-effect-test="travel-back">旅行归来</button>
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

function profileLevelTitle(currentProfile = profile) {
  return currentProfile?.levelTitle || stageText(currentProfile?.stage);
}

function profileBubbleTitle(currentProfile = profile) {
  if (!currentProfile?.adopted) return "你好，我是刘看山~";
  return `Lv.${currentProfile.level} ${profileLevelTitle(currentProfile)}`;
}

function petDisplayName() {
  const userName = (currentUser?.fullname || "").trim();
  const petName = profile?.petName || "刘看山";
  return userName ? `${userName}的${petName}` : petName;
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

function travelRequirementText({ isSleeping = false, wakeRemaining = 0 } = {}) {
  if (isSleeping) return `先阅读 ${wakeRemaining || 1} 篇内容唤醒看山后，就可以再次出门游历`;
  return travelState?.blockReason || "阅读内容积攒学识和精力后出门";
}

function disabledTravelButtonHTML(label, reason, className = "") {
  return `
    <span class="travel-disabled-tip" data-tip="${escapeHTML(reason)}" title="${escapeHTML(reason)}">
      <button class="${escapeHTML(className)}" data-hover-travel-start disabled>${escapeHTML(label)}</button>
    </span>
  `;
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

function pickOne(list = []) {
  if (!list.length) return "";
  return list[Math.floor(Math.random() * list.length)];
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
  bindOnce("[data-hover-growth-log]", (button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openGrowthLog();
    });
  });
  bindOnce("[data-hover-reward-walk]", (input) => {
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", (event) => {
      rewardWalkEnabled = !event.currentTarget.checked;
      localStorage.setItem("liukanshan_reward_walk_enabled", rewardWalkEnabled ? "1" : "0");
      showToast(rewardWalkEnabled ? "看山会走到触发点" : "已关闭看山移动");
      replacePetPanels();
    });
  });
  bindOnce("[data-hover-reset]", (button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      resetPet();
    });
  });
  bindOnce("[data-hover-boost-level]", (button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      boostPetToLevel10();
    });
  });
}

function renderPetHoverCard() {
  const card = document.getElementById("petHoverCard");
  if (!card) return;
  card.innerHTML = "";
  card.hidden = true;
}

function closeCharacterNotice() {
  const bubble = document.getElementById("speechBubble");
  window.clearInterval(noticeTimer);
  noticeTimer = null;
  noticeRemaining = 0;
  if (!bubble) return;
  bubble.classList.remove("follow-notice");
  bubble.textContent = profileBubbleTitle();
}

function showCharacterNotice(message, seconds = 20, title = "关注动态") {
  const bubble = document.getElementById("speechBubble");
  if (!bubble) return;
  window.clearInterval(noticeTimer);
  noticeRemaining = seconds;

  const render = () => {
    bubble.classList.add("follow-notice");
    bubble.innerHTML = `
      <div class="notice-title">${escapeHTML(title)}</div>
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

function hidePetHoverCardUntilNextHover() {
  const el = document.getElementById("roamingCharacter");
  if (!el) return;
  el.classList.add("hide-hover-card-once");
  const showAgain = () => {
    el.classList.remove("hide-hover-card-once");
  };
  el.addEventListener("mouseleave", () => {
    el.addEventListener("mouseenter", showAgain, { once: true });
  }, { once: true });
}

function showInteractionBubble(mode = "move") {
  const list = INTERACTION_BUBBLE_MESSAGES[mode] || INTERACTION_BUBBLE_MESSAGES.move;
  const message = pickOne(list);
  if (!message) return;
  hidePetHoverCardUntilNextHover();
  showCharacterNotice(message, 6, INTERACTION_NOTICE_TITLE);
}

function applyWakeUI(currentProfile) {
  // Updates the roaming character's sleeping styling and surfaces the LLM
  // wake/sleep message in the speech bubble. Detects sleep<->wake transitions
  // by comparing against `_prevWakeStatus` so we only show the bubble once
  // per transition (and re-show it when the LLM eventually fills in
  // lastWakeMessage). Sleeping bubble is sticky as long as the pet is asleep.
  const charEl = document.getElementById("roamingCharacter");
  if (charEl) {
    charEl.classList.toggle("is-sleeping", currentProfile?.wakeStatus === "sleeping");
  }
  if (!currentProfile?.adopted) {
    _prevWakeStatus = null;
    _lastWakeBubbleAt = null;
    return;
  }
  const status = currentProfile.wakeStatus || "awake";
  const bubbleStamp = currentProfile.wakeMessageAt || null;
  if (status === "sleeping") {
    const message =
      currentProfile.lastWakeMessage
      || "看山有点累了，先小睡一会儿，主人去读几条内容把我唤醒吧。";
    if (_prevWakeStatus !== "sleeping" || bubbleStamp !== _lastWakeBubbleAt) {
      showCharacterNotice(message, 18);
      _lastWakeBubbleAt = bubbleStamp;
    }
  } else if (status === "awake" && _prevWakeStatus === "sleeping") {
    if (currentProfile.lastWakeMessage) {
      showCharacterNotice(currentProfile.lastWakeMessage, 8);
      _lastWakeBubbleAt = bubbleStamp;
    }
    try {
      character?.playSpawnEffect?.({ scaleMultiplier: 1.2 });
    } catch (error) {
      console.warn("wake spawn effect failed", error);
    }
  }
  _prevWakeStatus = status;
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
  if (profile?.adopted) {
    await loadLevelVisuals().catch((error) => console.warn("level visuals preload failed", error));
  }
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

async function loadDailyStat() {
  if (!profile?.adopted) {
    dailyStat = null;
    return null;
  }
  try {
    const data = await api("/api/p0/pet/daily-stat");
    dailyStat = data?.dailyStat || null;
  } catch (err) {
    dailyStat = null;
  }
  return dailyStat;
}

function ensureFeedSeed(reset = false) {
  if (reset || !feedSeed) {
    feedSeed = randomId("recommend");
  }
  return feedSeed;
}

async function loadContents({ reset = true } = {}) {
  if (feedLoading) return feedItems;
  if (reset) {
    feedItems = [];
    feedNextOffset = 0;
    feedHasMore = true;
    ensureFeedSeed(true);
  } else if (!feedHasMore) {
    return feedItems;
  }
  feedLoading = true;
  const params = new URLSearchParams({
    limit: String(RECOMMEND_PAGE_SIZE),
    offset: String(feedNextOffset),
    seed: ensureFeedSeed(),
  });
  try {
    const data = await api(`/api/p0/contents?${params.toString()}`);
    const existingIds = new Set(feedItems.map((item) => item.id));
    const nextItems = (data.contents || []).filter((item) => item?.id && !existingIds.has(item.id));
    feedItems = reset ? nextItems : [...feedItems, ...nextItems];
    feedNextOffset = Number(data.nextOffset ?? (feedNextOffset + nextItems.length));
    feedHasMore = Boolean(data.hasMore);
  } finally {
    feedLoading = false;
  }
  return feedItems;
}

async function loadMoreContents() {
  if (feedLoading || !feedHasMore || window.location.pathname !== "/") return;
  const currentScroller = document.querySelector(".recommend-page .recommend-main");
  const previousScrollTop = currentScroller ? currentScroller.scrollTop : null;
  const beforeCount = feedItems.length;
  await loadContents({ reset: false });
  if (window.location.pathname === "/" && feedItems.length !== beforeCount) {
    renderRecommend();
    if (previousScrollTop !== null) {
      window.requestAnimationFrame(() => {
        const nextScroller = document.querySelector(".recommend-page .recommend-main");
        if (nextScroller) nextScroller.scrollTop = previousScrollTop;
      });
    }
  } else {
    updateRecommendFooter();
  }
}

async function loadAdminOverview() {
  if (!isAdminUser()) return null;
  const data = await api("/api/admin/overview");
  adminOverview = data;
  return data;
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
  if (leaderboardPromise && !refresh) return leaderboardPromise;
  leaderboardLoaded = false;
  leaderboardError = null;
  const endpoint = leaderboardType === "travel_count"
    ? "/api/p1/leaderboard/travel-count?limit=50"
    : "/api/p1/leaderboard/pet-level?limit=50";
  leaderboardPromise = (async () => {
    leaderboardData = await api(endpoint);
    leaderboardLoaded = true;
    return leaderboardData;
  })();
  try {
    return await leaderboardPromise;
  } catch (error) {
    leaderboardLoaded = true;
    leaderboardError = error;
    throw error;
  } finally {
    leaderboardPromise = null;
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

function growthChangeText(changeType) {
  return {
    total_exp: "经验",
    satiety: "学识值",
    mood: "心情",
    level: "等级",
    stage: "阶段",
  }[changeType] || changeType || "状态";
}

function growthSourceText(sourceType) {
  return {
    content_event: "内容消费",
    daily_task: "每日任务",
    manual: "系统奖励",
    decay: "自然衰减",
  }[sourceType] || sourceType || "成长事件";
}

function formatGrowthTime(value) {
  if (!value) return "";
  const text = String(value);
  const naiveMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
  if (naiveMatch && !hasTimezone) {
    return `${Number(naiveMatch[2])}-${naiveMatch[3]} ${naiveMatch[4]}:${naiveMatch[5]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function growthLogItem(log) {
  const delta = Number(log.delta || 0);
  const positive = delta > 0;
  const neutral = delta === 0;
  const sign = positive ? "+" : "";
  const valueChange = `${escapeHTML(String(log.beforeValue))} → ${escapeHTML(String(log.afterValue))}`;
  return `
    <article class="growth-log-item ${positive ? "positive" : neutral ? "neutral" : "negative"}">
      <div class="growth-log-main">
        <span>${escapeHTML(growthSourceText(log.sourceType))}</span>
        <strong>${escapeHTML(growthChangeText(log.changeType))} ${sign}${escapeHTML(String(delta))}</strong>
        ${log.reason ? `<p>${escapeHTML(log.reason)}</p>` : ""}
      </div>
      <div class="growth-log-side">
        <small>${escapeHTML(formatGrowthTime(log.createdAt))}</small>
        <em>${valueChange}</em>
      </div>
    </article>
  `;
}

function renderGrowthLogModal(logs = []) {
  document.querySelector(".growth-log-modal")?.remove();
  const modal = document.createElement("div");
  modal.className = "growth-log-modal";
  modal.innerHTML = `
    <div class="growth-log-dialog" role="dialog" aria-modal="true" aria-label="看山成长日志">
      <button class="content-close" aria-label="关闭">×</button>
      <div class="content-type">看山成长日志</div>
      <h1>成长与衰减记录</h1>
      <div class="growth-log-summary">
        <div><small>当前等级</small><strong>Lv.${profile?.level || 1}</strong></div>
        <div><small>学识值</small><strong>${profile?.satiety ?? "-"}</strong></div>
        <div><small>心情值</small><strong>${profile?.mood ?? "-"}</strong></div>
      </div>
      <div class="growth-log-list">
        ${logs.length ? logs.map(growthLogItem).join("") : `<p class="empty-growth-log">还没有成长记录，阅读、点赞或评论后会出现在这里。</p>`}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  removeOnboardingGuide();
  setLeaderboardScrollLock(true);
  modal.querySelector(".content-close").addEventListener("click", () => closeGrowthLogModal(modal));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeGrowthLogModal(modal);
  });
}

function closeGrowthLogModal(modal = document.querySelector(".growth-log-modal")) {
  modal?.remove();
  setLeaderboardScrollLock(false);
  scheduleOnboardingGuide(260);
}

async function openGrowthLog() {
  if (!profile?.adopted) {
    showToast("领养刘看山后查看成长日志");
    return;
  }
  markOnboardingStep("growthLog");
  renderGrowthLogModal([]);
  try {
    const data = await api("/api/p0/pet/growth-logs?limit=80");
    profile = data.profile || profile;
    handleDecayNotice(data.decayNotice);
    renderGrowthLogModal(data.logs || []);
  } catch (error) {
    showToast(error.message || "成长日志加载失败");
    closeGrowthLogModal();
  }
}

function leaderboardVisual(item) {
  const level = Number(item?.level || 1);
  const effectStyle = item?.levelEffectStyle || "cute";
  const image = item?.level2dThumbnail || item?.level2dImage;
  return `
    <div class="leaderboard-avatar-wrap" tabindex="0" aria-label="${escapeHTML(item?.fullname || "知乎用户")}的排行资料">
      <div class="leaderboard-visual level-${escapeHTML(effectStyle)}" title="${escapeHTML(item?.levelTitle || `Lv.${level}`)}">
        ${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(item?.levelTitle || `Lv.${level} 刘看山`)}">` : `<span>山</span>`}
        <small>Lv.${level}</small>
      </div>
      ${leaderboardUserPopover(item)}
    </div>
  `;
}

function leaderboardUserPopover(item) {
  const displayName = item?.fullname || "知乎用户";
  const headline = item?.headline || "这个人还没有填写个人简介";
  const description = item?.description || item?.petName || "正在和刘看山一起阅读成长";
  const avatar = item?.avatarPath
    ? `<img src="${escapeHTML(item.avatarPath)}" alt="${escapeHTML(displayName)}">`
    : `<span>${escapeHTML(displayName.slice(0, 1) || "知")}</span>`;
  const rankMetric = leaderboardType === "travel_count"
    ? `游历 ${formatCount(item?.travelCount || 0)} 次`
    : `${formatCount(item?.totalExp || 0)} 经验`;
  return `
    <div class="leaderboard-user-popover" role="tooltip">
      <div class="leaderboard-user-popover-head">
        <div class="leaderboard-user-avatar">${avatar}</div>
        <div>
          <strong>${escapeHTML(displayName)}</strong>
          <small>${escapeHTML(headline)}</small>
        </div>
      </div>
      <p>${escapeHTML(description)}</p>
      <div class="leaderboard-user-tags">
        <span>Lv.${escapeHTML(String(item?.level || 1))}</span>
        <span>${escapeHTML(item?.levelTitle || stageText(item?.stage))}</span>
        <span>${escapeHTML(rankMetric)}</span>
      </div>
    </div>
  `;
}

function leaderboardMetric(item) {
  const isTravel = leaderboardType === "travel_count";
  return isTravel
    ? `<strong>${formatCount(item.travelCount)} 次</strong><small>已领取 ${formatCount(item.claimedTravelCount)} 次</small>`
    : `<strong>Lv.${item.level}</strong><small>${formatCount(item.totalExp)} 经验</small>`;
}

function leaderboardPodiumItem(item) {
  const rankLabel = item.rank === 1 ? "第一名" : item.rank === 2 ? "第二名" : "第三名";
  return `
    <article class="leaderboard-podium-item rank-${item.rank} ${item.isCurrentUser ? "is-current" : ""}">
      <div class="leaderboard-podium-rank">${rankLabel}</div>
      ${leaderboardVisual(item)}
      <strong>${escapeHTML(item.fullname || "知乎用户")}</strong>
      <small>${escapeHTML(item.levelTitle || stageText(item.stage))}</small>
      <div class="leaderboard-podium-metric">${leaderboardMetric(item)}</div>
    </article>
  `;
}

function leaderboardPodium(items) {
  const topItems = items.slice(0, 3);
  if (!topItems.length) return "";
  return `
    <div class="leaderboard-podium count-${topItems.length}">
      ${topItems.map(leaderboardPodiumItem).join("")}
    </div>
  `;
}

function leaderboardItem(item) {
  const metric = leaderboardMetric(item);
  return `
    <article class="leaderboard-item ${item.isCurrentUser ? "is-current" : ""} rank-${item.rank <= 3 ? item.rank : "normal"}">
      <div class="leaderboard-rank">${item.rank}</div>
      ${leaderboardVisual(item)}
      <div class="leaderboard-user">
        <strong>${escapeHTML(item.fullname || "知乎用户")}</strong>
        <small>${escapeHTML(item.petName || "刘看山")} · ${escapeHTML(item.levelTitle || stageText(item.stage))}</small>
      </div>
      <div class="leaderboard-metric">
        ${metric}
      </div>
    </article>
  `;
}

function leaderboardBody(items) {
  if (!items.length) {
    return `<div class="leaderboard-empty">${escapeHTML(leaderboardEmptyText())}</div>`;
  }
  const restItems = items.slice(3);
  return `
    <div class="leaderboard-board">
      ${leaderboardPodium(items)}
      ${restItems.length
        ? `<div class="leaderboard-list">${restItems.map(leaderboardItem).join("")}</div>`
        : ""}
    </div>
  `;
}

function currentUserRankCard(data = leaderboardData) {
  if (!leaderboardLoaded && !leaderboardError) {
    return `<div class="leaderboard-my-card muted">我的排行加载中</div>`;
  }
  if (leaderboardError) {
    return `<div class="leaderboard-my-card muted">我的排行暂时加载失败</div>`;
  }
  const item = data?.currentUserItem;
  if (!profile?.adopted) {
    return `<div class="leaderboard-my-card muted">领养刘看山后即可参与排行榜</div>`;
  }
  if (!item) {
    return `<div class="leaderboard-my-card muted">${leaderboardType === "travel_count" ? "你还没有完成游历" : "你暂未进入榜单"}</div>`;
  }
  const sharedToday = Boolean(data?.shareRewardSharedToday);
  return `
    <div class="leaderboard-my-card">
      <span>我的名次</span>
      <strong>No.${item.rank}</strong>
      <small>Lv.${item.level} · ${formatCount(item.totalExp)} 经验 · 游历 ${formatCount(item.travelCount)} 次</small>
      <div class="leaderboard-share-box">
        <p>分享你的刘看山等级到「黑客松脑洞补给站」圈子：</p>
        <ul>
          <li>✅ 刘看山直接升 1 级、解锁新造型，更快养成专属阅读伙伴</li>
          <li>✅ 让更多人看到你的养成进度与专属看山形象</li>
        </ul>
        <button type="button" data-leaderboard-share ${sharedToday ? "disabled" : ""}>${sharedToday ? "明天再来分享领奖励" : "分享领升级奖励"}</button>
      </div>
    </div>
  `;
}

function leaderboardSideCard() {
  const items = leaderboardData?.rankType === leaderboardType ? (leaderboardData.items || []).slice(0, 5) : [];
  const body = !profile?.adopted
    ? `<div class="leaderboard-empty">领养刘看山后即可参与排行榜</div>`
    : !leaderboardLoaded
      ? `<div class="leaderboard-empty">榜单加载中</div>`
      : leaderboardError
        ? `<div class="leaderboard-empty">${escapeHTML(leaderboardError.message || "榜单加载失败")}</div>`
        : leaderboardBody(items);
  return `
    <section class="card side-card leaderboard-side-card" data-sidebar-leaderboard>
      <div class="side-title">
        <span>宠物排行榜</span>
        <small>${leaderboardTitle()}</small>
      </div>
      <div class="leaderboard-tabs">
        <button class="${leaderboardType === "pet_level" ? "active" : ""}" data-inline-leaderboard-type="pet_level">等级榜</button>
        <button class="${leaderboardType === "travel_count" ? "active" : ""}" data-inline-leaderboard-type="travel_count">游历榜</button>
      </div>
      ${body}
    </section>
  `;
}

function sidebarCards(options = {}) {
  const includeLeaderboard = Boolean(options.includeLeaderboard);
  if (includeLeaderboard) {
    return `
      ${petPanel()}
      ${creatorCard()}
      ${hotCard()}
    `;
  }
  return `
    ${creatorCard()}
    ${petPanel()}
    ${hotCard()}
  `;
}

function replaceSidebarLeaderboards() {
  document.querySelectorAll("[data-sidebar-leaderboard]").forEach((card) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = leaderboardSideCard().trim();
    card.replaceWith(wrapper.firstChild);
  });
  replacePetPanels();
  bindSidebarLeaderboard();
  updateThreeColumnPageLayout();
}

function replacePetPanels() {
  document.querySelectorAll("[data-pet-panel]").forEach((card) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = petPanel().trim();
    card.replaceWith(wrapper.firstChild);
  });
  bindPetHoverCard();
  bindSidebarLeaderboard();
  bindPanelBasics();
  updateThreeColumnPageLayout();
}

function ensureSidebarLeaderboard() {
  if ((!document.querySelector("[data-sidebar-leaderboard]") && !document.querySelector("[data-pet-panel]")) || !profile?.adopted) return;
  if (leaderboardData?.rankType === leaderboardType && leaderboardLoaded) return;
  loadLeaderboard(leaderboardType)
    .then(replaceSidebarLeaderboards)
    .catch(replaceSidebarLeaderboards);
}

function bindSidebarLeaderboard() {
  document.querySelectorAll("[data-open-leaderboard]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => openLeaderboardPanel());
  });
  document.querySelectorAll("[data-leaderboard-share]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => publishLeaderboardShare(button));
  });
  document.querySelectorAll("[data-inline-leaderboard-type]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      markOnboardingStep("leaderboard");
      const nextType = button.dataset.inlineLeaderboardType === "travel_count" ? "travel_count" : "pet_level";
      if (leaderboardType === nextType && leaderboardLoaded) return;
      leaderboardType = nextType;
      leaderboardLoaded = false;
      leaderboardError = null;
      replaceSidebarLeaderboards();
      try {
        await loadLeaderboard(leaderboardType, { refresh: true });
      } catch (error) {
        // The refreshed card renders the error message from leaderboardError.
      }
      replaceSidebarLeaderboards();
      if (leaderboardPanelOpen) renderLeaderboardPanel();
    });
  });
}

async function publishLeaderboardShare(button) {
  if (!profile?.adopted || !button || button.disabled) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "发送中...";
  trackEvent("pet_share_click", {
    targetType: "leaderboard",
    targetId: leaderboardType,
    props: {
      position: "leaderboard_share_box",
      petLevel: profile?.level,
      channel: "community",
    },
    immediate: true,
  });
  try {
    const data = await api("/api/p1/community/leaderboard-share", {
      method: "POST",
      body: JSON.stringify({ projectUrl: window.location.origin }),
    });
    if (data.profile) profile = data.profile;
    await loadTravelStatus();
    leaderboardLoaded = false;
    leaderboardData = null;
    await loadLeaderboard(leaderboardType, { refresh: true });
    communityLoaded = false;
    syncCharacter();
    if (data.reward) showReward(data.reward, button);
    renderCurrentRoute();
    showToast("已在「黑客松脑洞补给站」发了一条圈子，刘看山已升级并获得一次游历资格");
  } catch (error) {
    if (error?.status === 429 || error?.error === "LEADERBOARD_SHARE_DAILY_LIMIT") {
      leaderboardData = {
        ...(leaderboardData || {}),
        shareRewardSharedToday: true,
        shareRewardSharedAt: error.sharedAt || leaderboardData?.shareRewardSharedAt || null,
      };
      replaceSidebarLeaderboards();
      if (leaderboardPanelOpen) renderLeaderboardPanel();
      showToast(error.message || "今天已经分享过啦，明天再来分享领奖励");
      return;
    }
    button.disabled = false;
    button.textContent = originalText || "分享领升级奖励";
    showToast(error.message || "发圈子失败");
  }
}

function renderLeaderboardPanel() {
  let panel = document.getElementById("leaderboardPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "leaderboardPanel";
    panel.className = "leaderboard-modal";
    document.body.appendChild(panel);
  }
  const items = leaderboardData?.rankType === leaderboardType ? (leaderboardData.items || []) : [];
  const body = !leaderboardLoaded
    ? `<div class="leaderboard-empty">榜单加载中</div>`
    : leaderboardError
      ? `<div class="leaderboard-empty">${escapeHTML(leaderboardError.message || "榜单加载失败")}</div>`
      : leaderboardBody(items);
  panel.innerHTML = `
    <section class="leaderboard-panel leaderboard-dialog" role="dialog" aria-modal="true" aria-label="刘看山排行榜">
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
      ${body}
    </section>
  `;
  removeOnboardingGuide();
  setLeaderboardScrollLock(true);
  panel.querySelector("[data-leaderboard-close]").addEventListener("click", closeLeaderboardPanel);
  panel.onclick = (event) => {
    if (event.target === panel) closeLeaderboardPanel();
  };
  panel.querySelectorAll("[data-leaderboard-type]").forEach((button) => {
    button.addEventListener("click", () => switchLeaderboard(button.dataset.leaderboardType));
  });
  bindSidebarLeaderboard();
}

function setLeaderboardScrollLock(locked) {
  if (locked && document.body.classList.contains("leaderboard-scroll-lock")) return;
  if (!locked && !document.body.classList.contains("leaderboard-scroll-lock")) return;
  if (locked) {
    leaderboardLockedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = "fixed";
    document.body.style.top = `-${leaderboardLockedScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  } else {
    const restoreY = leaderboardLockedScrollY;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    leaderboardLockedScrollY = 0;
    window.scrollTo(0, restoreY);
  }
  document.documentElement.classList.toggle("leaderboard-scroll-lock", locked);
  document.body.classList.toggle("leaderboard-scroll-lock", locked);
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
  const nextType = type === "travel_count" ? "travel_count" : "pet_level";
  markOnboardingStep("leaderboard");
  trackEvent("leaderboard_open", {
    targetType: "leaderboard",
    targetId: nextType,
    props: { source: "pet_panel" },
  });
  leaderboardPanelOpen = true;
  leaderboardType = nextType;
  character?.setMessage?.("看看大家的看山都长到哪儿啦", { autoHide: 2200 });

  if (!(leaderboardData?.rankType === leaderboardType && leaderboardLoaded)) {
    try {
      await loadLeaderboard(leaderboardType);
    } catch (error) {
      showToast(error.message || "排行榜加载失败");
    }
  }
  if (leaderboardPanelOpen) renderLeaderboardPanel();
}

function closeLeaderboardPanel() {
  leaderboardPanelOpen = false;
  window.clearInterval(leaderboardPositionTimer);
  leaderboardPositionTimer = null;
  document.getElementById("leaderboardPanel")?.remove();
  setLeaderboardScrollLock(false);
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

  const isTravelAway = profile?.travelStatus === "traveling" && Date.now() > travelDepartureVisibleUntil;
  if (!profile?.adopted || isTravelAway) {
    container.style.display = "none";
    closeLeaderboardPanel();
    renderPetHoverCard();
    return;
  }

  container.style.display = "block";
  renderPetHoverCard();
  ensurePatHandler();
  const idleMessage = profileBubbleTitle();
  if (!character) {
    try {
      preloadCharacterModel();
      character = window.character = initRoamingCharacter({
        modelPath: MODEL_PATH,
        idleMessage,
        arrivedMessage: "我来啦",
        enableClickMove: false,
        scale: 0.85,
        speed: 480,
        spawnEffectDuration: ADOPTION_EFFECT_MS,
        maxGhostCount: 8,
        spawnIntervalFrames: 5,
        initialGhostOpacity: 0.34,
        ghostFadeSpeed: 0.045,
        evolveCanvasMarginLeft: -130,
        evolveCanvasMarginTop: -150,
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
          evolveTotalTime: LEVEL_UP_EFFECT_MS / 1000,
          evolveScaleMultiplier: 1.28,
          scalePunchFactor: 1.22,
        },
        enableIdleRingBand: false,
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
  applyWakeUI(profile);
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
        <a class="recommend-growth-tip ${active === "recommend" ? "active" : ""}" href="/" data-tip="${escapeHTML(RECOMMEND_GROWTH_TIP)}" title="${escapeHTML(RECOMMEND_GROWTH_TIP)}">推荐</a>
        <a class="${active === "hot" ? "active" : ""}" href="/hot">热榜</a>
        <a class="new-badge ${active === "community" ? "active" : ""}" href="/community">黑客松脑洞补给站</a>
        ${isAdminUser() ? `<a class="${active === "admin" ? "active" : ""}" href="/admin">管理平台</a>` : ""}
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

function isAuthorNoteCollapsed() {
  return localStorage.getItem(AUTHOR_NOTE_COLLAPSED_KEY) === "1";
}

function renderAuthorNote() {
  if (isAuthorNoteCollapsed()) {
    return `
      <aside class="author-note author-note-collapsed">
        <button type="button" data-author-note-toggle>展开作者的话</button>
      </aside>
    `;
  }
  const linkHtml = AUTHOR_ARTICLE_URL
    ? `<a class="author-note-link" href="${escapeHTML(AUTHOR_ARTICLE_URL)}" target="_blank" rel="noopener" aria-label="打开项目文章链接">打开项目文章</a>`
    : `<span class="author-note-link pending">项目文章链接待补充</span>`;
  const inlineArticleLink = AUTHOR_ARTICLE_URL
    ? `<a class="author-inline-link" href="${escapeHTML(AUTHOR_ARTICLE_URL)}" target="_blank" rel="noopener" aria-label="点击打开项目文章链接">项目文章链接</a>`
    : `<span class="author-inline-link pending">项目文章链接待补充</span>`;
  return `
    <aside class="author-note">
      <div class="author-note-head">
        <span>作者的话</span>
        <button type="button" data-author-note-toggle>收起</button>
      </div>
      <p><strong>HI 大家好，我们是「看山陪伴计划」开发团队。</strong></p>
      <p>本项目为 <mark>知乎黑客松专属原创作品</mark>，<mark>1:1 高精度复刻知乎主站 PC 端完整页面</mark>；现已独立落地 <mark>刘看山多元宇宙 S1 赛季</mark>全套内容设计，涵盖宏大角色世界观、10 级星际成长等级体系、专属背景故事设定，同时实现首页常驻陪伴展示、排行榜成长体系、圈子分享裂变等核心玩法闭环，可沉浸式体验电子宠物养成、社交互动的完整乐趣。</p>
      <p>项目以看山多元宇宙为长线宏大世界观基底，目前仅完成首个「知乎星」S1 赛季篇章。未来我们将持续拓展更多未知星系与文明星球，开启多赛季剧情连载，迭代全新等级形象外观，解锁专属游历支线、多元结伴探险等全新玩法；持续丰富 IP 内容生态与陪伴互动形式，为产品预留充足长线迭代空间与创意延伸可能。</p>
      <div class="author-note-cta">
        <strong>喜欢这个项目的话，请帮我们点一点！</strong>
        <p>恳请前往 ${inlineArticleLink} <mark>点赞</mark>、<mark>评论</mark>、<mark>支持</mark>。你的每一次点赞和互动，都能为项目增加更多关注度，助力刘看山陪伴计划早日落地入驻知乎主站，面向全网用户正式上线。</p>
      </div>
      <div class="author-note-cta author-note-ugc">
        <strong>也欢迎直接发布体验反馈</strong>
        <p>自发发布想法、创作文章，分享你的游玩体验、玩法建议、等级外观喜好以及未来创意脑洞。发布内容只需 <mark>@看山七子</mark>，我们团队都会逐一认真阅读、及时互动回复，持续迭代扩充刘看山宇宙后续赛季篇章、全新玩法与社交体系。</p>
      </div>
      <div class="author-note-footer">${linkHtml}</div>
    </aside>
  `;
}

function bindAuthorNote() {
  document.querySelectorAll("[data-author-note-toggle]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => {
      localStorage.setItem(AUTHOR_NOTE_COLLAPSED_KEY, isAuthorNoteCollapsed() ? "0" : "1");
      renderCurrentRoute();
    });
  });
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

async function pollFollowOverview(batchId, attempts = 12) {
  // 12 polls × 2s = 24s upper bound
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    let resp;
    try {
      resp = await api(`/api/p0/follow-moments/overview?batchId=${encodeURIComponent(batchId)}`);
    } catch (err) {
      continue;
    }
    if (!resp || resp.status === "pending") continue;
    if (resp.status === "ready" && resp.overviewText) {
      window._latestFollowSummaries = Array.isArray(resp.summaries) ? resp.summaries : [];
      showCharacterNotice(resp.overviewText, 8);
      // Re-render follow page so badges with new summaries appear immediately.
      if (window.location.pathname === "/follow") renderFollow();
      try {
        await api("/api/p0/follow-moments/overview/consume", {
          method: "POST",
          body: JSON.stringify({ batchId }),
        });
      } catch (_) {
        /* best effort */
      }
      return;
    }
    if (resp.status === "failed" || resp.status === "skipped") {
      // Fall through to existing fallback bubble (no extra action).
      return;
    }
  }
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
    if (data && data.batchId && data.llm && data.llm.plannedCount > 0) {
      pollFollowOverview(data.batchId);
    }
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
        <a class="recommend-growth-tip active" href="/" data-tip="${escapeHTML(RECOMMEND_GROWTH_TIP)}" title="${escapeHTML(RECOMMEND_GROWTH_TIP)}">推荐</a>
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
  scheduleOnboardingGuide();
}

function renderDailyQuests(stat) {
  if (!profile?.adopted) return "";
  const safeStat = stat || {};
  const signed = !!safeStat.signedInAt;
  const reads = (safeStat.validReadCount || 0) + (safeStat.validWatchCount || 0);
  const questDone = !!safeStat.quest3readsClaimed;
  return `
    <section class="card side-card daily-quests">
      <header class="daily-quests-title">每日任务</header>
      <ul class="daily-quests-list">
        <li class="daily-quest ${signed ? "is-done" : ""}">
          <span class="daily-quest-icon">${signed ? "✓" : "○"}</span>
          <span class="daily-quest-text">每日签到</span>
          ${signed
            ? `<span class="daily-quest-status">已领取</span>`
            : `<button class="daily-quest-btn" data-action="daily-signin">立即签到</button>`}
        </li>
        <li class="daily-quest ${questDone ? "is-done" : ""}">
          <span class="daily-quest-icon">${questDone ? "✓" : "○"}</span>
          <span class="daily-quest-text">浏览 3 条内容</span>
          <span class="daily-quest-progress">${Math.min(reads, 3)}/3</span>
        </li>
      </ul>
    </section>
  `;
}

async function handleDailySignin(button) {
  if (!button || button.disabled) return;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "签到中...";
  try {
    const resp = await api("/api/p1/daily/sign-in", { method: "POST", body: "{}" });
    if (resp?.alreadySignedIn) {
      showToast("今天已经签过啦");
    } else if (resp?.reward) {
      showReward({
        satiety: resp.reward.satiety,
        mood: resp.reward.mood,
        travelEnergy: resp.reward.travelEnergy,
      }, button);
      showToast("签到成功，看山很开心");
    }
    if (resp?.profile) profile = resp.profile;
    await loadDailyStat();
    syncCharacter();
    renderCurrentRoute();
  } catch (err) {
    button.disabled = false;
    button.textContent = originalText || "立即签到";
    showToast(err?.message || "签到失败");
  }
}

async function handlePetPat() {
  const now = Date.now();
  if (now - _lastPatAt < 1500) return; // local debounce
  _lastPatAt = now;
  try {
    const resp = await api("/api/p1/pet/pat", { method: "POST", body: "{}" });
    if (resp?.ok && resp.reaction) {
      hidePetHoverCardUntilNextHover();
      showCharacterNotice(resp.reaction, 4, INTERACTION_NOTICE_TITLE);
      if (resp.profile) profile = resp.profile;
      syncCharacter();
    }
  } catch (err) {
    if (err?.message) {
      hidePetHoverCardUntilNextHover();
      showCharacterNotice(err.message, 3, INTERACTION_NOTICE_TITLE);
    }
  }
}

function ensurePatHandler() {
  if (_patHandlerAttached) return;
  const el = document.getElementById("roamingCharacter");
  if (!el) return;
  el.addEventListener("click", (event) => {
    if (event.target.closest("#petHoverCard")) return;
    handlePetPat();
  });
  _patHandlerAttached = true;
}

function petPanel() {
  if (!profile?.adopted) {
    return `
      <section class="card side-card pet-panel" data-pet-panel>
        <div class="pet-title"><span class="pet-mini">山</span><span>刘看山还没到家</span></div>
        <button class="adopt-btn" data-adopt>领养刘看山</button>
      </section>
    `;
  }

  const activeTravel = travelState?.activeTravel;
  const isSleeping = profile.wakeStatus === "sleeping";
  const wakeRemaining = isSleeping
    ? Math.max((profile.wakeRequired ?? 3) - (profile.wakeProgress ?? 0), 1)
    : 0;
  const travelDisabledReason = travelRequirementText({
    isSleeping,
    wakeRemaining,
  });
  const travelAction = isSleeping
    ? disabledTravelButtonHTML("看山休眠中", travelDisabledReason, "outline-btn")
    : activeTravel?.status === "traveling"
    ? `<button class="outline-btn" data-hover-travel-return>立即归来</button>`
    : activeTravel?.status === "returned"
      ? `<button class="outline-btn" data-hover-travel-claim="${escapeHTML(activeTravel.travelId)}">领取带回内容</button>`
      : travelState?.canTravel === false
        ? disabledTravelButtonHTML("出门游历", travelDisabledReason, "outline-btn")
        : `<button class="outline-btn" data-hover-travel-start>出门游历</button>`;
  const visual = currentLevelVisual();
  const visualImage = visual?.imageUrl || visual?.thumbnailUrl;
  const resetButton = isAdminUser()
    ? `<button class="reset-pet-btn" data-reset-pet>重置刘看山</button>`
    : "";
  const boostLevel10Button = isAdminUser()
    ? `<button class="outline-btn" data-hover-boost-level>一键 Lv.10</button>`
    : "";
  const experienceBoostButton = Number(profile.level) >= 2 && Number(profile.level) < 10
    ? `<button class="outline-btn wide-action" data-boost-next-level>快速体验升一级</button>`
    : "";
  const travelHint = isSleeping
    ? `看山休眠中 · 还需阅读 ${wakeRemaining} 篇内容唤醒`
    : activeTravel?.status === "traveling"
      ? `${travelThemeText(activeTravel.theme)} · ${formatCountdown(activeTravel.expectedReturnAt)}`
      : activeTravel?.status === "returned"
        ? `${travelThemeText(activeTravel.theme)} · 已带回内容`
        : travelState?.blockReason || "阅读内容积攒学识和精力后出门";
  const experienceHint = Number(profile.level) < 2
    ? `<div class="pet-experience-hint">升到 <strong>Lv.2</strong> 后，可用「快速体验升一级」一路体验完整养成流程。</div>`
    : Number(profile.level) < 10
      ? `<div class="pet-experience-hint unlocked"><strong>已解锁快速体验</strong>，可逐级升级体验到 Lv.10 终极彩蛋。</div>`
      : `<div class="pet-experience-hint unlocked"><strong>完整流程已达成</strong>，Lv.10 终极形态已解锁。</div>`;
  return `
    <section class="card side-card pet-panel" data-pet-panel>
      <div class="pet-title">
        <span class="pet-mini pet-mini-image level-${escapeHTML(visual?.effectStyle || "cute")}">
          ${visualImage ? `<img src="${escapeHTML(visualImage)}" alt="${escapeHTML(visual.title || "刘看山等级形象")}">` : "山"}
        </span>
        <span>${escapeHTML(petDisplayName())}</span>
        <span class="level-pill">Lv.${profile.level}</span>
      </div>
      <div class="travel-panel-actions">
        ${experienceBoostButton}
        ${travelAction}
        <button class="outline-btn" data-hover-handbook>旅行手账</button>
        <button class="outline-btn" data-hover-growth-log>成长日志</button>
        <button class="outline-btn" data-open-leaderboard>查看排行榜</button>
        ${boostLevel10Button}
      </div>
      <div class="pet-travel-summary">
        <small>${escapeHTML(travelStatusText(profile.travelStatus))}</small>
        <strong>${escapeHTML(travelHint)}</strong>
      </div>
      <label class="pet-reward-toggle">
        <input type="checkbox" data-hover-reward-walk ${rewardWalkEnabled ? "" : "checked"}>
        <span>关闭看山移动</span>
      </label>
      ${experienceHint}
      ${petSkinSelectorHTML()}
      ${petSkinGuideHTML()}
      <div class="pet-level-showcase level-${escapeHTML(visual?.effectStyle || "cute")}">
        ${visualImage ? `<img src="${escapeHTML(visualImage)}" alt="${escapeHTML(visual.title || "刘看山等级形象")}">` : ""}
        <div>
          <strong>${escapeHTML(profileLevelTitle())}</strong>
          <small>${escapeHTML(visual?.description || "阅读越多，看山越强")}</small>
        </div>
      </div>
      ${currentUserRankCard()}
      <div class="pet-stats">
        <div class="stat-box stat-box-progress"><small>累计经验</small><strong>${profile.totalExp}</strong>${levelProgressHTML()}</div>
        <div class="stat-box"><small>学识值</small><strong>${profile.satiety}</strong></div>
        <div class="stat-box"><small>心情值</small><strong>${profile.mood}</strong></div>
        <div class="stat-box"><small>游历精力</small><strong>${profile.travelEnergy ?? 0}</strong></div>
        <div class="stat-box"><small>游历状态</small><strong>${travelStatusText(profile.travelStatus)}</strong></div>
      </div>
      ${resetButton}
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
        <textarea class="composer-input" rows="1" maxlength="500" placeholder="分享此刻的想法..." aria-label="分享此刻的想法"></textarea>
        <div class="composer-tools" aria-hidden="true">${composerToolIcons()}</div>
        <div class="composer-submit">
          <span class="sync-target">同步到圈子${svgIcon("composer-caret", `<path d="m7 10 5 5 5-5"></path>`)}</span>
          <button class="blue-btn composer-publish-btn" type="button">发想法</button>
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
  const thumbnailUrl = item.thumbnailUrl || item.imageUrls?.[0] || "";
  const media = thumbnailUrl
    ? `<button class="feed-media feed-media-image" data-open-content="${escapeHTML(item.id)}" aria-label="打开内容图片">
        <img src="${escapeHTML(thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.feed-media')?.remove()">
      </button>`
    : item.media
    ? `<div class="feed-media ${escapeHTML(item.media)}">${escapeHTML(item.mediaLabel || "").replace(/\n/g, "<br>")}</div>`
    : "";
  const liked = Boolean(item.interactions?.like);
  const collected = Boolean(item.interactions?.collect);
  const excerpt = media ? truncateText(item.excerpt, 120) : item.excerpt;
  return `
    <article class="card feed-card" data-content-id="${escapeHTML(item.id)}" data-content-type="${escapeHTML(item.type)}">
      <h2><button class="content-open-title" data-open-content="${escapeHTML(item.id)}">${escapeHTML(item.title)}</button></h2>
      <div class="feed-body ${media ? "" : "no-media"}">
        ${media}
        <p class="feed-excerpt">
          <strong class="feed-author">${escapeHTML(item.author)}</strong>：${escapeHTML(excerpt)}
          <button class="read-link" data-open-content="${escapeHTML(item.id)}">${escapeHTML(item.readText)}⌄</button>
        </p>
      </div>
      <div class="feed-actions">
        <button class="vote-btn ${liked ? "is-liked" : ""}" data-interact="${escapeHTML(item.id)}" data-action="like" aria-pressed="${liked ? "true" : "false"}" ${liked ? "disabled" : ""}>${feedActionIcon("up")}<span>${liked ? "已赞同" : "赞同"} ${item.counts.like}</span></button>
        <button class="vote-btn vote-btn-down" aria-label="反对">${feedActionIcon("down")}</button>
        <button class="feed-action feed-action-comment" data-interact="${escapeHTML(item.id)}" data-action="comment">${feedActionIcon("comment")}<span>${item.counts.comment} 条评论</span></button>
        <button class="feed-action ${collected ? "active" : ""}" data-interact="${escapeHTML(item.id)}" data-action="collect" aria-pressed="${collected ? "true" : "false"}" ${collected ? "disabled" : ""}>${feedActionIcon("collect")}<span>${collected ? "已收藏" : item.counts.collect}</span></button>
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
  // Best-effort match summaries: raw_payload from listing endpoint lacks
  // moment_key, so fall back to actorName match within the latest batch.
  const actorName = actor.name || "";
  const summaryEntry = (window._latestFollowSummaries || []).find(
    (s) => s && (s.key === moment.momentKey || (actorName && s.actorName === actorName)),
  );
  const llmSummary = (summaryEntry && summaryEntry.summary) || moment.llmSummary || "";
  const llmBadge = llmSummary
    ? `<span class="follow-llm-badge" data-llm-summary="${escapeHTML(llmSummary)}" aria-label="刘看山一句话总结">看山一句</span>`
    : "";
  return `
    <article class="card follow-moment-card">
      <div class="follow-moment-source">
        <span class="follow-moment-avatar avatar"></span>
        <span><strong>${escapeHTML(actor.name || "知乎用户")}</strong>${escapeHTML(action)}</span>
        ${timeText ? `<small>${escapeHTML(timeText)}</small>` : ""}
        ${llmBadge}
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
        if (window.location.pathname !== "/community") return;
        // loadCommunity 已经把 communityLoaded=true / communityError 写好，
        // 必须重绘一次让兜底文案 (communityError.message) 取代"加载中"。
        renderCommunity();
        showToast("圈子数据加载失败");
      });
  }
  const emptyText = communityError
    ? (communityError.message || "圈子数据加载失败")
    : "圈子数据加载中";
  app.innerHTML = `
    ${shell("community")}
    <main class="page community-page">
      ${renderAuthorNote()}
      <section class="community-main">
        ${communityHero()}
        ${communityContents.length
          ? communityContents.map(communityPinCard).join("")
          : `<section class="card follow-empty">${escapeHTML(emptyText)}</section>`}
      </section>
      <aside class="side-stack">
        ${sidebarCards()}
      </aside>
    </main>
  `;
  bindCommon();
  bindCommunity();
}

function adminStatCard(label, value) {
  return `
    <div class="admin-stat-card">
      <small>${escapeHTML(label)}</small>
      <strong>${formatCount(value)}</strong>
    </div>
  `;
}

function adminDailyMetricChart(items = []) {
  const rows = Array.isArray(items) ? items : [];
  const width = 760;
  const height = 260;
  const pad = { top: 24, right: 26, bottom: 42, left: 42 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(1, ...rows.flatMap((item) => [Number(item.registeredUsers || 0), Number(item.logins || 0)]));
  const xFor = (index) => pad.left + (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const yFor = (value) => pad.top + plotHeight - (Number(value || 0) / maxValue) * plotHeight;
  const points = (key) => rows.map((item, index) => `${xFor(index).toFixed(1)},${yFor(item[key]).toFixed(1)}`).join(" ");
  const last = rows[rows.length - 1] || {};
  const yTicks = [0, Math.ceil(maxValue / 2), maxValue];
  const dateLabel = (date) => {
    const parts = String(date || "").split("-");
    return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : String(date || "");
  };
  return `
    <section class="card admin-section admin-chart-section">
      <div class="side-title">
        <span>每日注册 / 登录</span>
        <small>近 ${rows.length || 14} 天项目访问趋势</small>
      </div>
      <div class="admin-chart-summary">
        <div><small>今日注册</small><strong>${formatCount(last.registeredUsers || 0)}</strong></div>
        <div><small>今日登录</small><strong>${formatCount(last.logins || 0)}</strong></div>
      </div>
      <svg class="admin-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="每日注册和登录折线图">
        ${yTicks.map((tick) => `
          <g>
            <line x1="${pad.left}" y1="${yFor(tick).toFixed(1)}" x2="${width - pad.right}" y2="${yFor(tick).toFixed(1)}"></line>
            <text class="admin-chart-y" x="${pad.left - 10}" y="${(yFor(tick) + 4).toFixed(1)}">${formatCount(tick)}</text>
          </g>
        `).join("")}
        ${rows.map((item, index) => index % Math.max(1, Math.ceil(rows.length / 7)) === 0 || index === rows.length - 1 ? `
          <text class="admin-chart-x" x="${xFor(index).toFixed(1)}" y="${height - 12}">${escapeHTML(dateLabel(item.date))}</text>
        ` : "").join("")}
        <polyline class="admin-line admin-line-register" points="${points("registeredUsers")}"></polyline>
        <polyline class="admin-line admin-line-login" points="${points("logins")}"></polyline>
        ${rows.map((item, index) => `
          <circle class="admin-point admin-point-register" cx="${xFor(index).toFixed(1)}" cy="${yFor(item.registeredUsers).toFixed(1)}" r="3">
            <title>${escapeHTML(item.date)} 注册 ${formatCount(item.registeredUsers || 0)}</title>
          </circle>
          <circle class="admin-point admin-point-login" cx="${xFor(index).toFixed(1)}" cy="${yFor(item.logins).toFixed(1)}" r="3">
            <title>${escapeHTML(item.date)} 登录 ${formatCount(item.logins || 0)}</title>
          </circle>
        `).join("")}
      </svg>
      <div class="admin-chart-legend">
        <span class="register">注册用户</span>
        <span class="login">登录项目</span>
      </div>
    </section>
  `;
}

function adminAnalyticsChart(items = []) {
  const rows = Array.isArray(items) ? items : [];
  const width = 760;
  const height = 260;
  const pad = { top: 24, right: 26, bottom: 42, left: 42 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const metricKeys = ["exposeUv", "consumeUv", "levelUpUv", "shareSuccessUv"];
  const maxValue = Math.max(1, ...rows.flatMap((item) => metricKeys.map((key) => Number(item[key] || 0))));
  const xFor = (index) => pad.left + (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const yFor = (value) => pad.top + plotHeight - (Number(value || 0) / maxValue) * plotHeight;
  const points = (key) => rows.map((item, index) => `${xFor(index).toFixed(1)},${yFor(item[key]).toFixed(1)}`).join(" ");
  const yTicks = [0, Math.ceil(maxValue / 2), maxValue];
  const dateLabel = (date) => {
    const parts = String(date || "").split("-");
    return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : String(date || "");
  };
  return `
    <section class="card admin-section admin-chart-section">
      <div class="side-title">
        <span>行为埋点趋势</span>
        <small>近 ${rows.length || 14} 天轻量行为 UV</small>
      </div>
      <svg class="admin-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="行为埋点折线图">
        ${yTicks.map((tick) => `
          <g>
            <line x1="${pad.left}" y1="${yFor(tick).toFixed(1)}" x2="${width - pad.right}" y2="${yFor(tick).toFixed(1)}"></line>
            <text class="admin-chart-y" x="${pad.left - 10}" y="${(yFor(tick) + 4).toFixed(1)}">${formatCount(tick)}</text>
          </g>
        `).join("")}
        ${rows.map((item, index) => index % Math.max(1, Math.ceil(rows.length / 7)) === 0 || index === rows.length - 1 ? `
          <text class="admin-chart-x" x="${xFor(index).toFixed(1)}" y="${height - 12}">${escapeHTML(dateLabel(item.date))}</text>
        ` : "").join("")}
        <polyline class="admin-line admin-line-expose" points="${points("exposeUv")}"></polyline>
        <polyline class="admin-line admin-line-consume" points="${points("consumeUv")}"></polyline>
        <polyline class="admin-line admin-line-level" points="${points("levelUpUv")}"></polyline>
        <polyline class="admin-line admin-line-share" points="${points("shareSuccessUv")}"></polyline>
        ${rows.map((item, index) => metricKeys.map((key) => `
          <circle class="admin-point admin-point-${key}" cx="${xFor(index).toFixed(1)}" cy="${yFor(item[key]).toFixed(1)}" r="2.5">
            <title>${escapeHTML(item.date)} ${key} ${formatCount(item[key] || 0)}</title>
          </circle>
        `).join("")).join("")}
      </svg>
      <div class="admin-chart-legend admin-analytics-legend">
        <span class="expose">看山曝光</span>
        <span class="consume">内容消费</span>
        <span class="level">升级</span>
        <span class="share">分享成功</span>
      </div>
    </section>
  `;
}

function adminAnalyticsFunnel(funnel = []) {
  const rows = Array.isArray(funnel) ? funnel : [];
  const maxValue = Math.max(1, ...rows.map((item) => Number(item.value || 0)));
  return `
    <section class="card admin-section">
      <div class="side-title"><span>关键行为漏斗</span><small>今日 UV，轻量可观测</small></div>
      <div class="admin-funnel-list">
        ${rows.map((item) => {
          const value = Number(item.value || 0);
          const width = Math.max(4, (value / maxValue) * 100);
          return `
            <article>
              <span>${escapeHTML(item.label || "")}</span>
              <div><i style="width:${width.toFixed(1)}%"></i></div>
              <strong>${formatCount(value)}</strong>
            </article>
          `;
        }).join("") || `<p class="admin-empty">今日还没有行为数据</p>`}
      </div>
    </section>
  `;
}

function formatAdminDateTime(value) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function adminWatchedUsersSection(items = []) {
  const rows = Array.isArray(items) ? items : [];
  return `
    <section class="card admin-section">
      <div class="side-title"><span>我关注的使用了平台</span><small>固定观察 token：zhouyuan、a-le-85-17、qhlee</small></div>
      <div class="admin-watched-users">
        ${rows.map((item) => {
          const registered = Boolean(item.registered);
          const used = Boolean(item.usedPlatform);
          const statusText = used ? "已使用" : registered ? "已注册" : "未使用";
          const statusClass = used ? "used" : registered ? "registered" : "idle";
          const name = item.fullname || item.token;
          return `
            <article>
              <div class="admin-watched-user-main">
                <strong>${escapeHTML(name)}</strong>
                <small>${escapeHTML(item.token || "")}</small>
              </div>
              <span class="admin-watch-status ${statusClass}">${statusText}</span>
              <div class="admin-watched-user-meta">
                <span>最近登录：${escapeHTML(formatAdminDateTime(item.lastLoginAt))}</span>
                <span>最近行为：${escapeHTML(formatAdminDateTime(item.lastEventAt))}</span>
              </div>
              <div class="admin-watched-user-stats">
                <span>访问 ${formatCount(item.pageViews || 0)}</span>
                <span>消费 ${formatCount(item.contentConsumes || 0)}</span>
                <span>${item.adopted ? `Lv.${formatCount(item.level || 1)} · ${formatCount(item.totalExp || 0)} 经验` : "未领养"}</span>
              </div>
            </article>
          `;
        }).join("") || `<p class="admin-empty">暂无观察 token</p>`}
      </div>
    </section>
  `;
}

function renderAdmin() {
  if (!isAdminUser()) {
    app.innerHTML = `
      ${shell("admin")}
      <main class="admin-page">
        <section class="card admin-denied">
          <h1>暂无管理权限</h1>
          <p>仅指定用户 token 可访问刘看山管理后台。</p>
        </section>
      </main>
    `;
    return;
  }
  if (!adminOverview) {
    loadAdminOverview()
      .then(() => {
        if (window.location.pathname === "/admin") renderAdmin();
      })
      .catch((error) => {
        adminOverview = { error };
        if (window.location.pathname === "/admin") renderAdmin();
      });
  }
  const stats = adminOverview?.stats || {};
  const levels = adminOverview?.levels || [];
  const projectDailyMetrics = adminOverview?.projectDailyMetrics || [];
  const analytics = adminOverview?.analytics || {};
  const analyticsToday = analytics.today || {};
  const watchedUsers = adminOverview?.watchedUsers || [];
  app.innerHTML = `
    ${shell("admin")}
    <main class="admin-page">
      <section class="card admin-hero">
        <div>
          <div class="content-type">刘看山管理后台</div>
          <h1>配置与观测中心</h1>
          <p>后续等级、埋点、运营开关和素材配置都可以在这里收口。</p>
        </div>
        <span class="admin-token-pill">${escapeHTML(currentUser?.userToken || "admin")}</span>
      </section>
      ${adminOverview?.error ? `<section class="card admin-denied">后台数据加载失败：${escapeHTML(adminOverview.error.message || "未知错误")}</section>` : ""}
      <section class="admin-stat-grid">
        ${adminStatCard("用户数", stats.users ?? "-")}
        ${adminStatCard("已领养", stats.adoptedPets ?? "-")}
        ${adminStatCard("内容池", stats.contents ?? "-")}
        ${adminStatCard("成长日志", stats.growthEvents ?? "-")}
        ${adminStatCard("游历记录", stats.travels ?? "-")}
      </section>
      <section class="admin-stat-grid">
        ${adminStatCard("今日看山曝光 UV", analyticsToday.petExposeUv ?? 0)}
        ${adminStatCard("今日内容消费 UV", analyticsToday.contentConsumeUv ?? 0)}
        ${adminStatCard("今日升级 UV", analyticsToday.levelUpUv ?? 0)}
        ${adminStatCard("今日游历 UV", analyticsToday.travelStartUv ?? 0)}
        ${adminStatCard("今日分享成功 UV", analyticsToday.shareSuccessUv ?? 0)}
      </section>
      ${adminWatchedUsersSection(watchedUsers)}
      ${adminDailyMetricChart(projectDailyMetrics)}
      ${adminAnalyticsChart(analytics.series || [])}
      ${adminAnalyticsFunnel(analytics.funnel || [])}
      <section class="card admin-section">
        <div class="side-title"><span>等级配置</span><small>当前只读，后续开放编辑</small></div>
        <div class="admin-level-table">
          ${levels.length ? levels.map((item) => `
            <article>
              <span>Lv.${item.level}</span>
              <strong>${escapeHTML(item.title)}</strong>
              <small>${escapeHTML(stageText(item.stage))} · ${formatCount(item.requiredTotalExp)} 经验 · ${escapeHTML(item.effectStyle)}</small>
            </article>
          `).join("") : `<p>等级配置加载中</p>`}
        </div>
      </section>
      <section class="card admin-section">
        <div class="side-title"><span>预留能力</span><small>下一阶段</small></div>
        <div class="admin-placeholder-grid">
          <div><strong>埋点看板</strong><small>已接入轻量行为漏斗、趋势和每日注册登录</small></div>
          <div><strong>等级编辑</strong><small>称号、阶段、2D 图、升级阈值</small></div>
          <div><strong>运营开关</strong><small>奖励、衰减、游历资格配置</small></div>
        </div>
      </section>
    </main>
  `;
}

function renderRecommend() {
  app.innerHTML = `
    ${shell("recommend")}
    <main class="page recommend-page">
      ${renderAuthorNote()}
      <section class="recommend-main">
        ${composer()}
        ${feedItems.map(feedCard).join("")}
        ${recommendLoadMoreFooter()}
      </section>
      <aside class="side-stack">
        ${sidebarCards({ includeLeaderboard: true })}
      </aside>
    </main>
  `;
  bindCommon();
  bindRecommend();
}

function recommendLoadMoreFooter() {
  if (feedLoading) {
    return `<div class="recommend-load-state" data-recommend-load-state>加载中...</div>`;
  }
  if (!feedHasMore) {
    return `<div class="recommend-load-state" data-recommend-load-state>没有更多内容了</div>`;
  }
  return `<div class="recommend-load-state" data-recommend-load-state>继续滑动加载更多</div>`;
}

function updateRecommendFooter() {
  const footer = document.querySelector("[data-recommend-load-state]");
  if (!footer) return;
  footer.outerHTML = recommendLoadMoreFooter();
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
      ${renderAuthorNote()}
      <section class="follow-main">
        ${followMoments.length
          ? followMoments.map(followMomentCard).join("")
          : `<section class="card follow-empty">${followMomentsLoaded ? emptyText : "关注动态加载中"}</section>`}
      </section>
      <aside class="side-stack">
        ${sidebarCards()}
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
      ${renderAuthorNote()}
      <section class="zh-hot-list-card">
        ${hotItems.length
          ? hotItems.map(hotListItem).join("")
          : `<div class="zh-hot-empty">${hotItemsLoaded ? "暂无热榜" : "热榜加载中"}</div>`}
      </section>
      <aside class="side-stack">
        ${sidebarCards()}
      </aside>
    </main>
  `;
  bindCommon();
}

function stageLabel(stage) {
  return ({ cub: "幼崽", growing: "成长", adult: "成年", advanced: "进阶" })[stage] || stage || "";
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
        ${renderAuthorNote()}
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
          ${renderDailyQuests(dailyStat)}
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
  if (profile?.adopted && !dailyStat) {
    loadDailyStat().then(() => {
      const aside = document.querySelector(".profile-grid .side-stack");
      if (!aside) return;
      const existing = aside.querySelector(".daily-quests");
      const html = renderDailyQuests(dailyStat);
      if (!html) return;
      if (existing) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html.trim();
        existing.replaceWith(wrapper.firstChild);
      }
    });
  }
}

function bindPanelBasics() {
  document.querySelectorAll("[data-adopt]").forEach((button) => {
    if (button.dataset.basicBound) return;
    button.dataset.basicBound = "1";
    button.addEventListener("click", adoptPet);
  });
  document.querySelectorAll("[data-reset-pet]").forEach((button) => {
    if (button.dataset.basicBound) return;
    button.dataset.basicBound = "1";
    button.addEventListener("click", resetPet);
  });
  document.querySelectorAll("[data-boost-next-level]").forEach((button) => {
    if (button.dataset.basicBound) return;
    button.dataset.basicBound = "1";
    button.addEventListener("click", () => boostPetOneLevel(button));
  });
  document.querySelectorAll("[data-pet-skin]").forEach((button) => {
    if (button.dataset.basicBound) return;
    button.dataset.basicBound = "1";
    button.addEventListener("click", () => switchPetSkin(button.dataset.petSkin));
  });
}

function bindCommon() {
  bindAuthorNote();
  bindPanelBasics();
  bindPetHoverCard();
  bindSidebarLeaderboard();
  ensureSidebarLeaderboard();
  bindThreeColumnPageScroll();
}

function bindRecommend() {
  bindRecommendScroll();
  bindComposerPetInteraction();
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
      if (button.disabled) return;
      const item = feedItems.find((entry) => entry.id === button.dataset.interact);
      if (button.dataset.action === "comment") {
        // 评论按钮不再直接发奖：打开内容弹窗，并把焦点放到评论框
        if (!item) return;
        openContent(item, button).then(() => {
          window.setTimeout(() => {
            const ta = document.querySelector(".content-modal .comment-textarea");
            ta?.focus();
          }, 60);
        });
        return;
      }
      if (["like", "collect"].includes(button.dataset.action)) {
        button.disabled = true;
      }
      submitContentEvent(item, button.dataset.action, button);
      button.classList.add("active");
    });
  });
}

function threeColumnPage() {
  return document.querySelector(".recommend-page, .follow-page, .hot-page, .community-page");
}

function threeColumnScroller(page = threeColumnPage()) {
  return page?.querySelector(".recommend-main, .follow-main, .zh-hot-list-card, .community-main");
}

function captureThreeColumnScrollState() {
  const page = threeColumnPage();
  const scroller = threeColumnScroller(page);
  if (!page || !scroller) return null;
  return {
    path: window.location.pathname,
    scrollTop: scroller.scrollTop,
  };
}

function restoreThreeColumnScrollState(state) {
  if (!state) return;
  window.requestAnimationFrame(() => {
    if (window.location.pathname !== state.path) return;
    const scroller = threeColumnScroller();
    if (!scroller) return;
    updateThreeColumnPageLayout();
    scroller.scrollTop = Math.min(state.scrollTop, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    updateThreeColumnFloatingColumns();
  });
}

function bindThreeColumnPageScroll() {
  const page = threeColumnPage();
  const scroller = threeColumnScroller(page);
  if (!page || !scroller) return;
  updateThreeColumnPageLayout();
  if (!scroller.dataset.threeColumnScrollBound) {
    scroller.dataset.threeColumnScrollBound = "1";
    scroller.addEventListener("scroll", () => {
      maybeLoadMoreContents(scroller);
      scheduleThreeColumnFloatingColumns();
    }, { passive: true });
  }
  if (page.dataset.wheelBound) return;
  page.dataset.wheelBound = "1";
  page.addEventListener("wheel", (event) => {
    if (window.matchMedia("(max-width: 1100px)").matches) return;
    const editableTarget = event.target.closest?.("input, textarea, select, [contenteditable='true']");
    if (editableTarget) return;
    if (!event.deltaY) return;
    event.preventDefault();
    scroller.scrollTop += event.deltaY;
    maybeLoadMoreContents(scroller);
    scheduleThreeColumnFloatingColumns();
  }, { passive: false });
  window.requestAnimationFrame(() => {
    maybeLoadMoreContents(scroller);
    updateThreeColumnFloatingColumns();
  });
}

function updateThreeColumnPageLayout() {
  const page = threeColumnPage();
  if (!page) return;
  const sideItems = [...page.querySelectorAll(".author-note, .side-stack")];
  const scroller = threeColumnScroller(page);
  const spacer = threeColumnScrollSpacer(scroller);
  if (window.matchMedia("(max-width: 1100px)").matches) {
    sideItems.forEach((item) => {
      item.style.transform = "";
    });
    if (spacer) spacer.style.height = "0px";
    return;
  }
  if (scroller && spacer) {
    spacer.style.height = "0px";
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const availableHeight = viewportHeight - scroller.getBoundingClientRect().top - 10;
    const maxSideOffset = sideItems.reduce((maxOffset, item) => {
      return Math.max(maxOffset, item.scrollHeight - availableHeight);
    }, 0);
    const currentScrollRange = scroller.scrollHeight - scroller.clientHeight;
    const extraScrollSpace = Math.max(0, maxSideOffset - currentScrollRange);
    spacer.style.height = `${Math.ceil(extraScrollSpace)}px`;
    const adjustedScrollRange = scroller.scrollHeight - scroller.clientHeight;
    if (adjustedScrollRange < maxSideOffset) {
      spacer.style.height = `${Math.ceil(extraScrollSpace + maxSideOffset - adjustedScrollRange)}px`;
    }
  }
  updateThreeColumnFloatingColumns();
}

function threeColumnScrollSpacer(scroller) {
  if (!scroller) return null;
  let spacer = scroller.querySelector(":scope > [data-three-column-scroll-spacer]");
  if (!spacer) {
    spacer = document.createElement("div");
    spacer.className = "three-column-scroll-spacer";
    spacer.dataset.threeColumnScrollSpacer = "1";
    scroller.appendChild(spacer);
  }
  return spacer;
}

function updateThreeColumnFloatingColumns() {
  const page = threeColumnPage();
  if (!page || window.matchMedia("(max-width: 1100px)").matches) return;
  const scroller = threeColumnScroller(page);
  if (!scroller) return;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const availableHeight = viewportHeight - scroller.getBoundingClientRect().top - 10;
  page.querySelectorAll(".author-note, .side-stack").forEach((item) => {
    const maxOffset = Math.max(0, item.scrollHeight - availableHeight);
    const offset = Math.min(scroller.scrollTop, maxOffset);
    item.style.transform = offset > 0 ? `translateY(${-offset}px)` : "";
  });
}

function scheduleThreeColumnFloatingColumns() {
  if (threeColumnLayoutFrame) return;
  threeColumnLayoutFrame = window.requestAnimationFrame(() => {
    threeColumnLayoutFrame = 0;
    updateThreeColumnFloatingColumns();
  });
}

function maybeLoadMoreContents(scrollTarget = window) {
  if (window.location.pathname !== "/" || feedLoading || !feedHasMore) return;
  if (
    scrollTarget === window
    && document.querySelector(".recommend-page .recommend-main")
    && !window.matchMedia("(max-width: 1100px)").matches
  ) return;
  const remaining = scrollTarget === window
    ? document.documentElement.scrollHeight - window.scrollY - window.innerHeight
    : scrollTarget.scrollHeight - scrollTarget.scrollTop - scrollTarget.clientHeight;
  if (remaining < 520) {
    loadMoreContents().catch(() => {
      feedLoading = false;
      updateRecommendFooter();
      showToast("推荐内容加载失败");
    });
  }
}

function bindRecommendScroll() {
  if (feedScrollBound) return;
  feedScrollBound = true;
  window.addEventListener("scroll", () => maybeLoadMoreContents(window), { passive: true });
  window.addEventListener("resize", () => updateThreeColumnPageLayout(), { passive: true });
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
    markOnboardingStep("interact");
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
  removeOnboardingGuide();
  modal.querySelector(".content-close").addEventListener("click", () => closeBlockingModal(modal));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeBlockingModal(modal);
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
    markOnboardingStep("interact");
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
  trackEvent("content_open", {
    targetType: "content",
    targetId: item.id,
    props: {
      contentType: item.type,
      actionType: item.action,
      source: sourceElement?.dataset?.source || "feed",
    },
  });
  try {
    const data = await api(`/api/p0/contents/${encodeURIComponent(item.id)}`);
    renderContentModal(data.content);
    if (profile?.adopted) {
      markOnboardingStep("consume");
      submitContentEvent(item, item.action, sourceElement);
    } else {
      showToast("领养刘看山后，阅读会转化为成长");
    }
  } catch (error) {
    showToast(error.message || "内容加载失败");
  }
}

function renderCommentEditor(content) {
  const contentId = content.contentId || content.id || "";
  const contentType = content.contentType || content.type || "article";
  return `
    <section class="comment-editor" data-content-id="${escapeHTML(contentId)}" data-content-type="${escapeHTML(contentType)}">
      <div class="comment-editor-header">
        <span class="comment-editor-title">写下你的评论</span>
        <button type="button" class="comment-ai-btn" data-action="ai-comment">
          <span class="comment-ai-icon">✨</span>
          让看山帮你想一句
        </button>
      </div>
      <textarea class="comment-textarea" placeholder="说点什么吧（6-200 字）" rows="4" maxlength="200"></textarea>
      <div class="comment-editor-footer">
        <span class="comment-char-count">0/200</span>
        <button type="button" class="comment-submit-btn" data-action="comment-submit" disabled>提交评论</button>
      </div>
    </section>
  `;
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
      ${renderCommentEditor(content)}
    </div>
  `;
  document.body.appendChild(modal);
  removeOnboardingGuide();
  movePetToCommentAssist(modal);
  const closeModal = () => {
    discardActiveCommentAssist();
    sendPetHomeFromCommentAssist();
    closeBlockingModal(modal);
  };
  modal.querySelector(".content-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  bindCommentEditor(modal);
}

function movePetToCommentAssist(modal) {
  const pet = characterElement();
  if (!character || !pet) return;
  const dialog = modal.querySelector(".content-dialog");
  if (!dialog) return;
  const place = () => {
    const rect = dialog.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // 锚到弹框右外边框附近：X 贴弹框右缘外侧、Y 取弹框下半的固定比例，
    // 避免依赖评论编辑器在弹框内的滚动位置导致位置抖动。
    const targetX = Math.min(
      window.innerWidth - 80,
      Math.max(rect.right + 56, rect.right + 24),
    );
    const targetY = Math.max(
      120,
      Math.min(window.innerHeight - 140, rect.top + rect.height * 0.66),
    );
    pet.classList.add("roaming-comment-assist");
    // 出发时静默：内置 arrivedMessage 会在到达瞬间盖掉移动期消息，
    // 所以等 isMovingStatus 变 false 再 setMessage 才能让台词稳定出现。
    character.moveTo?.(targetX, targetY, { useRandomMessage: false });

    const startedAt = Date.now();
    const speakWhenArrived = () => {
      if (!modal.isConnected) return;
      if (!pet.classList.contains("roaming-comment-assist")) return;
      const stillMoving = character.isMovingStatus?.();
      const timedOut = Date.now() - startedAt > 5000;
      if (stillMoving && !timedOut) {
        window.setTimeout(speakWhenArrived, 80);
        return;
      }
      character.setMessage?.("我陪你一起写一句吧～", { autoHide: 4000 });
    };
    window.setTimeout(speakWhenArrived, 80);
  };
  window.requestAnimationFrame(place);
}

function sendPetHomeFromCommentAssist() {
  const pet = characterElement();
  if (!pet) return;
  if (!pet.classList.contains("roaming-comment-assist")) return;
  window.setTimeout(() => {
    if (!character) {
      pet.classList.remove("roaming-comment-assist");
      return;
    }
    const homeX = window.innerWidth - 150;
    const homeY = window.innerHeight - 200;
    character.moveTo?.(homeX, homeY, { useRandomMessage: false });
    window.setTimeout(() => {
      pet.classList.remove("roaming-comment-assist");
    }, 900);
  }, 260);
}

const COMPOSER_PET_PHRASES = [
  "想到什么就写下来呗～",
  "嗯嗯，我在听～",
  "今天想分享点什么呀？",
  "把脑子里的小火花记下来吧✨",
  "我陪你一起想想～",
];
let composerPetMoveTimer = 0;
let composerPetHomeTimer = 0;

function movePetToComposer(composerSection) {
  const pet = characterElement();
  if (!character || !pet || !composerSection) return;
  const rect = composerSection.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  // 停靠到 composer 左侧外缘，竖向对齐到输入行附近。
  const targetX = Math.max(60, rect.left - 24);
  const targetY = Math.max(120, Math.min(window.innerHeight - 140, rect.top + 32));
  pet.classList.add("roaming-composer-assist");
  character.moveTo?.(targetX, targetY, { useRandomMessage: false });

  const phrase = COMPOSER_PET_PHRASES[Math.floor(Math.random() * COMPOSER_PET_PHRASES.length)];
  const startedAt = Date.now();
  const speakWhenArrived = () => {
    if (!pet.classList.contains("roaming-composer-assist")) return;
    const stillMoving = character.isMovingStatus?.();
    const timedOut = Date.now() - startedAt > 5000;
    if (stillMoving && !timedOut) {
      composerPetMoveTimer = window.setTimeout(speakWhenArrived, 80);
      return;
    }
    character.setMessage?.(phrase, { autoHide: 4000 });
  };
  window.clearTimeout(composerPetMoveTimer);
  composerPetMoveTimer = window.setTimeout(speakWhenArrived, 80);
}

function sendPetHomeFromComposer() {
  const pet = characterElement();
  if (!pet) return;
  if (!pet.classList.contains("roaming-composer-assist")) return;
  window.clearTimeout(composerPetHomeTimer);
  composerPetHomeTimer = window.setTimeout(() => {
    if (!character) {
      pet.classList.remove("roaming-composer-assist");
      return;
    }
    const homeX = window.innerWidth - 150;
    const homeY = window.innerHeight - 200;
    character.moveTo?.(homeX, homeY, { useRandomMessage: false });
    window.setTimeout(() => {
      pet.classList.remove("roaming-composer-assist");
    }, 900);
  }, 260);
}

function bindComposerPetInteraction() {
  const composerSection = document.querySelector(".recommend-main .composer");
  if (!composerSection) return;
  const input = composerSection.querySelector(".composer-input");
  if (!input || composerSection.dataset.petBound === "1") return;
  composerSection.dataset.petBound = "1";

  composerSection.addEventListener("focusin", () => {
    if (composerSection.classList.contains("is-focused")) return;
    window.clearTimeout(composerPetHomeTimer);
    composerSection.classList.add("is-focused");
    movePetToComposer(composerSection);
  });

  composerSection.addEventListener("focusout", (event) => {
    // 焦点仍在 composer 内部（比如从 textarea 跳到发布按钮）时，不让看山离开。
    if (composerSection.contains(event.relatedTarget)) return;
    composerSection.classList.remove("is-focused");
    sendPetHomeFromComposer();
  });
}

function bindCommentEditor(modalRoot) {
  const editor = modalRoot.querySelector(".comment-editor");
  if (!editor) return;
  const textarea = editor.querySelector(".comment-textarea");
  const submitBtn = editor.querySelector(".comment-submit-btn");
  const counter = editor.querySelector(".comment-char-count");
  const aiBtn = editor.querySelector(".comment-ai-btn");

  // While AI is streaming, force submit disabled — otherwise user can submit
  // before `done` arrives and the assistLogId never gets attached to the request.
  const updateSubmitState = () => {
    if (editor.dataset.aiStreaming === "true") {
      submitBtn.disabled = true;
      return;
    }
    const len = textarea.value.length;
    submitBtn.disabled = len < 6 || len > 200;
  };

  textarea.addEventListener("input", () => {
    const len = textarea.value.length;
    counter.textContent = `${len}/200`;
    if (submitBtn.textContent === "已提交 ✓" && len > 0) {
      submitBtn.textContent = "提交评论";
    }
    updateSubmitState();
  });

  aiBtn.addEventListener("click", () => {
    if (_activeCommentAssist) {
      _activeCommentAssist.abort();
      _activeCommentAssist = null;
    }
    const contentId = editor.dataset.contentId;
    if (!contentId) return;
    aiBtn.disabled = true;
    aiBtn.innerHTML = '<span class="comment-ai-icon">⌛</span>看山在写...';
    textarea.value = "";
    counter.textContent = "0/200";
    editor.dataset.aiStreaming = "true";
    updateSubmitState();
    let logId = null;
    const url = `/api/p1/comment/assist?content_id=${encodeURIComponent(contentId)}`;
    const es = new EventSource(url);
    _activeCommentAssist = {
      abort: () => es.close(),
      logId: null,
    };
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.id) {
          logId = data.id;
          if (_activeCommentAssist) _activeCommentAssist.logId = logId;
        }
        if (data.chunk) {
          textarea.value += data.chunk;
          counter.textContent = `${textarea.value.length}/200`;
        }
        if (data.done) {
          es.close();
          _activeCommentAssist = null;
          aiBtn.disabled = false;
          aiBtn.innerHTML = '<span class="comment-ai-icon">↻</span>换一句';
          if (logId) editor.dataset.assistLogId = String(logId);
          editor.dataset.aiStreaming = "false";
          updateSubmitState();
        }
      } catch (e) {
        /* ignore parse errors */
      }
    };
    es.onerror = () => {
      es.close();
      _activeCommentAssist = null;
      aiBtn.disabled = false;
      aiBtn.innerHTML = '<span class="comment-ai-icon">✨</span>让看山帮你想一句';
      editor.dataset.aiStreaming = "false";
      updateSubmitState();
    };
  });

  submitBtn.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (text.length < 6) return;
    const requestBody = {
      contentId: editor.dataset.contentId,
      commentText: text,
      assistLogId: editor.dataset.assistLogId ? Number(editor.dataset.assistLogId) : null,
    };
    submitBtn.disabled = true;
    submitBtn.textContent = "提交中...";
    try {
      const resp = await api("/api/p1/comment/submit", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });
      if (resp?.profile) profile = resp.profile;
      if (resp?.content) mergeUpdatedContent(resp.content);
      if (resp?.duplicateInteraction) {
        submitBtn.textContent = "已评论 ✓";
        submitBtn.disabled = true;
        showToast(resp.message || "已经操作过这篇内容");
        syncCharacter();
        renderCurrentRoute();
        return;
      }
      if (resp?.reward) showReward(resp.reward, submitBtn);
      markOnboardingStep("interact");
      syncCharacter();
      renderCurrentRoute();
      // mark assist log as used (no need to discard on close anymore)
      _activeCommentAssist = null;
      delete editor.dataset.assistLogId;
      textarea.value = "";
      counter.textContent = "0/200";
      submitBtn.textContent = "已提交 ✓";
      submitBtn.disabled = true;
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "提交评论";
      showToast(err?.message || "提交失败");
    }
  });
}

function discardActiveCommentAssist() {
  if (!_activeCommentAssist) return;
  const handle = _activeCommentAssist;
  _activeCommentAssist = null;
  try {
    handle.abort();
  } catch (_) { /* ignore */ }
  if (handle.logId) {
    api("/api/p1/comment/discard", {
      method: "POST",
      body: JSON.stringify({ assistLogId: handle.logId }),
    }).catch(() => {});
  }
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
  clearCharacterEffectTimers();
  const { x: centerX, y: centerY } = effectStageCenter();
  character?.setPosition?.(centerX, centerY);
  travelAnimationTimer = window.setTimeout(() => {
    character?.startGoTravel?.({
      message: travel.message || "出发旅行！",
      autoHide: 2400,
    });
    travelAnimationTimer = null;
  }, 80);
  window.setTimeout(() => {
    if (profile?.travelStatus !== "traveling") return;
    travelDepartureVisibleUntil = 0;
    characterElement()?.classList.remove("roaming-traveling", "roaming-departing", "roaming-returning");
    syncCharacter();
  }, 3600);
}

function playTravelReturn(travel) {
  clearCharacterEffectTimers();
  const { x: centerX, y: centerY } = effectStageCenter();
  character?.setPosition?.(centerX, centerY);
  character?.startBackHome?.({
    message: travel.message || "旅行回来啦！",
    autoHide: 2800,
  });
  travelAnimationTimer = window.setTimeout(() => {
    character?.setPosition?.(window.innerWidth - 150, window.innerHeight - 200);
    travelAnimationTimer = null;
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
    travelDepartureVisibleUntil = Date.now() + 3800;
    syncCharacter();
    renderCurrentRoute();
    pet?.setMessage?.(data.message || "看山出发啦", { autoHide: 2200 });
    playTravelDeparture(data.travel);
    markOnboardingStep("travel");
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
  const visual = currentLevelVisual();
  const visualImage = visual?.imageUrl || visual?.thumbnailUrl;
  const visualBadge = visualImage ? `
    <div class="handbook-level-visual level-${escapeHTML(visual?.effectStyle || "cute")}">
      <img src="${escapeHTML(visualImage)}" alt="${escapeHTML(visual.title || "刘看山等级形象")}">
      <span>Lv.${profile?.level || 1}</span>
    </div>
  ` : "";
  const llmReady = status === "ready" && !!summaryText;
  const sharePayload = JSON.stringify({
    theme: entry.coverStyle,
    travelId: entry.travelId,
    llmSummary: entry.llmSummary,
    llmPetQuote: entry.llmPetQuote,
    llmHighlights: entry.llmHighlights,
    level: profile?.level || 1,
    levelTitle: visual?.title || "",
    level2dImage: visualImage || "",
    levelEffectStyle: visual?.effectStyle || "cute",
    shareBgImage: visual?.shareBgImage || "",
  });
  const shareBtn = `
    <button type="button" class="handbook-share-btn"
            ${llmReady ? "" : "disabled"}
            data-share-handbook="${escapeHTML(sharePayload)}">
      ${llmReady ? "分享这次旅行" : "等看山写完再分享～"}
    </button>
  `;
  return `
    <article class="travel-handbook-entry ${escapeHTML(entry.coverStyle || "")}">
      <div>
        ${visualBadge}
        <small>${escapeHTML(entry.themeTitle || "")}</small>
        ${badgeBlock}
        ${summaryBlock}
        <p class="handbook-pet-quote">${escapeHTML(quote)}</p>
        ${highlightsBlock}
        ${shareBtn}
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
  removeOnboardingGuide();
  modal.querySelector(".content-close").addEventListener("click", () => closeBlockingModal(modal));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeBlockingModal(modal);
  });
}

async function openTravelHandbook() {
  trackEvent("handbook_open", {
    targetType: "travel",
    targetId: "handbook",
    props: { source: "pet_panel" },
  });
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
  removeOnboardingGuide();
  modal.querySelector(".content-close").addEventListener("click", () => closeBlockingModal(modal));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeBlockingModal(modal);
  });
  modal.querySelectorAll(".handbook-content-button").forEach((button) => {
    button.addEventListener("click", () => handleHandbookContentClick(button));
  });
  modal.querySelectorAll("[data-share-handbook]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      let data;
      try {
        data = JSON.parse(button.dataset.shareHandbook);
      } catch {
        return;
      }
      if (typeof window.openShareCardPreview !== "function") {
        showToast("分享组件未就绪");
        return;
      }
      window.openShareCardPreview(data);
    });
  });
}

async function adoptPet() {
  trackEvent("pet_adopt_click", {
    targetType: "pet",
    targetId: "liukanshan",
    props: { source: "profile_panel" },
    immediate: true,
  });
  try {
    const data = await api("/api/p0/pet/adopt", {
      method: "POST",
      body: JSON.stringify({ petName: "刘看山" }),
    });
    profile = data.profile;
    await loadTravelStatus();
    syncCharacter();
    closeStoryIntro(true);
    removeOnboardingGuide();
    onboardingSnoozedUntil = Date.now() + ADOPTION_EFFECT_MS + EFFECT_SETTLE_MS + 400;
    renderCurrentRoute();
    showToast("刘看山已到家");
    character?.setMessage("你好，我是刘看山~", { autoHide: ADOPTION_EFFECT_MS + EFFECT_SETTLE_MS });
    scheduleOnboardingGuide(ADOPTION_EFFECT_MS + EFFECT_SETTLE_MS + 400);
    window.requestAnimationFrame(() => playHomecomingEffect());
  } catch (error) {
    showToast(error.message || "领养失败");
  }
}

async function resetPet() {
  try {
    clearCharacterEffectTimers();
    const data = await api("/api/p0/pet/reset", {
      method: "POST",
      body: JSON.stringify({}),
    });
    profile = data.profile;
    travelState = null;
    resetStoryIntroSeen();
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

async function boostPetToLevel10() {
  try {
    const data = await api("/api/p0/pet/boost-level-10", {
      method: "POST",
      body: JSON.stringify({}),
    });
    profile = data.profile;
    leaderboardLoaded = false;
    leaderboardData = null;
    renderCurrentRoute();
    const reward = data.reward || {};
    if (reward.levelUp) {
      showReward(reward, null);
    } else {
      showToast("刘看山已是 Lv.10，结尾彩蛋已打开");
      character?.setMessage?.("宇宙知识领航者，归位！", { autoHide: LEVEL_UP_EFFECT_MS });
      window.setTimeout(() => showLevelEndingModal(), 500);
    }
  } catch (error) {
    showToast(error.message || "一键升级失败");
  }
}

async function boostPetOneLevel(sourceButton) {
  if (sourceButton) sourceButton.disabled = true;
  try {
    const data = await api("/api/p0/pet/boost-next-level", {
      method: "POST",
      body: JSON.stringify({}),
    });
    profile = data.profile;
    leaderboardLoaded = false;
    leaderboardData = null;
    renderCurrentRoute();
    syncCharacter();
    const reward = data.reward || {};
    if (reward.levelUp) {
      showReward(reward, null);
    } else {
      showToast("刘看山已达成 Lv.10，完整流程已解锁");
      window.setTimeout(() => showLevelEndingModal(), 500);
    }
  } catch (error) {
    if (sourceButton) sourceButton.disabled = false;
    showToast(error.message || "快速升级失败");
  }
}

async function submitContentEvent(item, actionType, sourceElement) {
  if (!profile?.adopted) {
    showToast("先去个人页领养刘看山");
    window.history.pushState({}, "", "/people/p2wcex");
    renderCurrentRoute();
    return;
  }
  const scrollState = captureThreeColumnScrollState();

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
    if (data.duplicateInteraction) {
      showToast(data.message || "已经操作过这篇内容");
      renderCurrentRoute();
      restoreThreeColumnScrollState(scrollState);
      return;
    }
    showReward(data.reward, sourceElement);
    if (["read", "watch"].includes(normalizedAction)) {
      markOnboardingStep("consume");
    }
    if (["like", "comment", "collect"].includes(normalizedAction)) {
      markOnboardingStep("interact");
    }
    renderCurrentRoute();
    restoreThreeColumnScrollState(scrollState);
  } catch (error) {
    if (sourceElement) sourceElement.disabled = false;
    showToast(error.message || "事件提交失败");
  }
}

function showReward(reward, sourceElement) {
  const partsText = rewardText(reward);
  if (!reward?.levelUp && !partsText) return;
  const message = reward.levelUp
    ? `看山升级啦！Lv.${reward.fromLevel} → Lv.${reward.toLevel}`
    : `看山成长了：${partsText}`;
  showToast(message);
  if (reward.levelUp) {
    clearCharacterEffectTimers();
    showLevelUpPreview(reward).catch((error) => console.warn("level preview failed", error));
    if (Number(reward.toLevel) >= 10 && Number(reward.fromLevel || 0) < 10) {
      levelEndingTimer = window.setTimeout(() => {
        showLevelEndingModal();
        levelEndingTimer = null;
      }, LEVEL_UP_EFFECT_MS + EFFECT_SETTLE_MS);
    }
  }
  if (character && reward.levelUp) {
    const { x: centerX, y: centerY } = effectStageCenter();
    character.setPosition?.(centerX, centerY);
    character.playEvolveEffect?.({ message, autoHide: LEVEL_UP_EFFECT_MS });
    pulseCharacter("pet-level-up", LEVEL_UP_EFFECT_MS);
    levelUpReturnTimer = window.setTimeout(() => {
      character?.setPosition?.(window.innerWidth - 150, window.innerHeight - 200);
      character?.setMessage?.(profileBubbleTitle(), { autoHide: 2200 });
      levelUpReturnTimer = null;
    }, LEVEL_UP_EFFECT_MS + EFFECT_SETTLE_MS);
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

async function showLevelUpPreview(reward) {
  await loadLevelVisuals();
  const visual = visualForLevel(reward.toLevel) || currentLevelVisual();
  const milestone = LEVEL_MILESTONES[Number(reward.toLevel)] || {};
  const image = visual?.imageUrl || visual?.thumbnailUrl;
  if (!visual && !milestone.title) return;
  document.querySelector(".level-up-preview")?.remove();
  const panel = document.createElement("div");
  panel.className = `level-up-preview level-${visual?.effectStyle || "cute"}`;
  panel.innerHTML = `
    ${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(milestone.title || visual?.title || `Lv.${reward.toLevel} 刘看山`)}">` : ""}
    <div>
      <small>${Number(reward.toLevel) >= 10 ? "终极形态解锁" : "解锁新阶段"}</small>
      <strong>Lv.${reward.toLevel} · ${escapeHTML(milestone.title || visual?.title || "刘看山")}</strong>
      <em>${escapeHTML(milestone.quote || "看山又长大了一点。")}</em>
      <span>${escapeHTML(milestone.feature || visual?.description || "继续阅读，解锁更酷的看山")}</span>
    </div>
  `;
  document.body.appendChild(panel);
  removeAfter(panel, LEVEL_UP_EFFECT_MS + EFFECT_SETTLE_MS);
}

async function showLevelEndingModal() {
  await loadLevelVisuals().catch(() => {});
  clearLevelEndingComicState();
  document.querySelector(".level-ending-modal")?.remove();
  const modal = document.createElement("div");
  modal.className = "level-ending-modal story-comic-modal level-ending-comic-modal";
  modal.innerHTML = `
    <section class="story-comic-dialog level-ending-comic-dialog" role="dialog" aria-modal="true" aria-label="刘看山终极彩蛋">
      <div class="story-comic-extended-bg" aria-hidden="true"></div>
      <div class="story-comic-grid" data-comic-grid aria-label="终章故事分镜"></div>
      <figure class="story-comic-focus" data-comic-focus hidden>
        <div class="story-comic-frame">
          <img data-comic-image alt="">
        </div>
      </figure>
      <div class="story-comic-final level-ending-comic-final" data-comic-final hidden>
        <button type="button" class="story-primary story-comic-adopt level-ending-comic-continue" data-ending-close>继续探索知乎星</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  removeOnboardingGuide();
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-ending-close]")) return;
    accelerateLevelEndingComic();
  });
  const close = () => {
    clearLevelEndingComicState();
    closeBlockingModal(modal);
  };
  modal.querySelector("[data-ending-close]").addEventListener("click", close);
  playLevelEndingComic(modal);
}

function playRewardEffect(reward, sourceElement, message) {
  const sourceRect = sourceElement?.getBoundingClientRect();
  const center = characterCenter();
  const sourceX = sourceRect ? sourceRect.left + sourceRect.width / 2 : center.x;
  const sourceY = sourceRect ? sourceRect.top + sourceRect.height / 2 : center.y;

  if (reward.levelUp) {
    pulseCharacter("pet-level-up", LEVEL_UP_EFFECT_MS);
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
  } else if (path === "/admin") {
    renderAdmin();
  } else {
    renderRecommend();
  }
  window.requestAnimationFrame(() => syncCharacter());
  trackPageView(path);
  window.requestAnimationFrame(observePetPanelExposure);
  if (maybeShowStoryIntro()) return;
  scheduleOnboardingGuide();
}

window.addEventListener("popstate", renderCurrentRoute);
window.addEventListener("pagehide", flushAnalytics);
window.addEventListener("liukanshan-interaction-bubble", (event) => {
  showInteractionBubble(event.detail?.mode || "move");
});
document.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link) return;
  const url = new URL(link.href);
  if (url.origin === window.location.origin && ["/", "/people/p2wcex", "/hot", "/follow", "/community", "/admin"].includes(url.pathname)) {
    event.preventDefault();
    window.history.pushState({}, "", url.pathname);
    renderCurrentRoute();
  }
});
document.addEventListener("click", (event) => {
  const target = event.target.closest('[data-action="daily-signin"]');
  if (!target) return;
  event.preventDefault();
  handleDailySignin(target);
});

const authUser = await loadAuth();
if (authUser) {
  await loadProfile();
  await loadTravelStatus();
  await loadDailyStat();
  await loadContents();
  if (window.location.pathname === "/hot") {
    await loadHotItems().catch(() => {});
  } else {
    loadHotItems().catch(() => {});
  }
  if (window.location.pathname === "/follow") {
    await loadFollowMoments({ sync: true }).catch(() => {});
  }
  if (window.location.pathname === "/community") {
    await loadCommunity().catch(() => {});
  }
  renderCurrentRoute();
  syncFollowMoments();
} else {
  renderLoginGate();
}
renderEffectTestPanel();
