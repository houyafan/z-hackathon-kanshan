PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS zhihu_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid INTEGER NOT NULL,
  user_token TEXT DEFAULT NULL,
  fullname TEXT NOT NULL,
  gender TEXT DEFAULT NULL,
  headline TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  avatar_path TEXT DEFAULT NULL,
  phone_no TEXT DEFAULT NULL,
  email TEXT DEFAULT NULL,
  last_login_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (uid)
);

CREATE TABLE IF NOT EXISTS zhihu_oauth_token (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  access_token TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  expires_at TEXT NOT NULL,
  scope TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS auth_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (session_id)
);

CREATE TABLE IF NOT EXISTS oauth_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  state TEXT NOT NULL,
  next_url TEXT DEFAULT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (state)
);

CREATE TABLE IF NOT EXISTS pet_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  adopted INTEGER NOT NULL DEFAULT 0 CHECK (adopted IN (0, 1)),
  pet_name TEXT NOT NULL DEFAULT '刘看山',

  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  stage TEXT NOT NULL DEFAULT 'cub' CHECK (stage IN ('cub', 'growing', 'adult', 'advanced')),
  total_exp INTEGER NOT NULL DEFAULT 0 CHECK (total_exp >= 0),

  satiety INTEGER NOT NULL DEFAULT 50 CHECK (satiety BETWEEN 0 AND 100),
  mood INTEGER NOT NULL DEFAULT 50 CHECK (mood BETWEEN 0 AND 100),
  health INTEGER NOT NULL DEFAULT 100 CHECK (health BETWEEN 0 AND 100),
  wake_status TEXT NOT NULL DEFAULT 'awake'
    CHECK (wake_status IN ('awake', 'sleeping')),
  wake_progress INTEGER NOT NULL DEFAULT 0,
  last_wake_message TEXT DEFAULT NULL,
  wake_message_at TEXT DEFAULT NULL,
  travel_energy INTEGER NOT NULL DEFAULT 0 CHECK (travel_energy >= 0),
  travel_status TEXT NOT NULL DEFAULT 'home'
    CHECK (travel_status IN ('home', 'traveling', 'returned', 'cooldown', 'sleeping')),
  current_travel_id TEXT DEFAULT NULL,
  cooldown_until TEXT DEFAULT NULL,
  last_travel_at TEXT DEFAULT NULL,

  total_read_count INTEGER NOT NULL DEFAULT 0 CHECK (total_read_count >= 0),
  total_watch_count INTEGER NOT NULL DEFAULT 0 CHECK (total_watch_count >= 0),
  total_interaction_count INTEGER NOT NULL DEFAULT 0 CHECK (total_interaction_count >= 0),

  last_growth_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS pet_content_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,

  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('article', 'pin', 'video', 'novel')),
  action_type TEXT NOT NULL CHECK (action_type IN ('read', 'watch', 'like', 'comment', 'collect')),

  completion_ratio REAL DEFAULT NULL CHECK (completion_ratio IS NULL OR (completion_ratio >= 0 AND completion_ratio <= 1)),
  duration_sec INTEGER DEFAULT NULL CHECK (duration_sec IS NULL OR duration_sec >= 0),
  content_tags TEXT DEFAULT NULL CHECK (content_tags IS NULL OR json_valid(content_tags)),

  reward_status TEXT NOT NULL DEFAULT 'granted' CHECK (reward_status IN ('pending', 'granted', 'ignored')),
  exp_reward INTEGER NOT NULL DEFAULT 0 CHECK (exp_reward >= 0),
  satiety_reward INTEGER NOT NULL DEFAULT 0 CHECK (satiety_reward >= 0),
  mood_reward INTEGER NOT NULL DEFAULT 0 CHECK (mood_reward >= 0),
  travel_energy_reward INTEGER NOT NULL DEFAULT 0 CHECK (travel_energy_reward >= 0),

  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (event_id)
);

CREATE TABLE IF NOT EXISTS pet_growth_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,

  source_type TEXT NOT NULL CHECK (source_type IN ('content_event', 'daily_task', 'manual', 'decay', 'pat')),
  source_id TEXT NOT NULL,

  change_type TEXT NOT NULL CHECK (change_type IN ('total_exp', 'satiety', 'mood', 'level', 'stage', 'travel_energy', 'health', 'wake_status')),
  delta INTEGER NOT NULL,
  before_value INTEGER NOT NULL,
  after_value INTEGER NOT NULL,

  reason TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pet_level_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level INTEGER NOT NULL CHECK (level >= 1),
  stage TEXT NOT NULL CHECK (stage IN ('cub', 'growing', 'adult', 'advanced')),
  required_total_exp INTEGER NOT NULL CHECK (required_total_exp >= 0),
  title TEXT DEFAULT NULL,
  unlock_features TEXT DEFAULT NULL CHECK (unlock_features IS NULL OR json_valid(unlock_features)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (level),
  UNIQUE (required_total_exp)
);

CREATE TABLE IF NOT EXISTS pet_level_visual_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level INTEGER NOT NULL CHECK (level >= 1),
  stage TEXT NOT NULL CHECK (stage IN ('cub', 'growing', 'adult', 'advanced')),
  title TEXT NOT NULL,
  effect_style TEXT NOT NULL
    CHECK (effect_style IN ('cute', 'explore', 'cool', 'legendary')),
  image_url TEXT NOT NULL,
  thumbnail_url TEXT DEFAULT NULL,
  share_bg_url TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (level)
);

CREATE TABLE IF NOT EXISTS pet_daily_stat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  stat_date TEXT NOT NULL,

  valid_read_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_read_count >= 0),
  valid_watch_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_watch_count >= 0),
  valid_interaction_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_interaction_count >= 0),

  exp_gained INTEGER NOT NULL DEFAULT 0 CHECK (exp_gained >= 0),
  satiety_gained INTEGER NOT NULL DEFAULT 0 CHECK (satiety_gained >= 0),
  mood_gained INTEGER NOT NULL DEFAULT 0 CHECK (mood_gained >= 0),
  travel_energy_gained INTEGER NOT NULL DEFAULT 0 CHECK (travel_energy_gained >= 0),

  signed_in_at TEXT DEFAULT NULL,
  quest_3reads_claimed INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_id, stat_date)
);

CREATE TABLE IF NOT EXISTS project_daily_metric (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_date TEXT NOT NULL,
  registered_user_count INTEGER NOT NULL DEFAULT 0 CHECK (registered_user_count >= 0),
  login_count INTEGER NOT NULL DEFAULT 0 CHECK (login_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (stat_date)
);

CREATE TABLE IF NOT EXISTS analytics_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  user_id INTEGER DEFAULT NULL,
  visit_id TEXT DEFAULT NULL,
  event_name TEXT NOT NULL,
  page_path TEXT DEFAULT NULL,
  referer_path TEXT DEFAULT NULL,
  target_type TEXT DEFAULT NULL,
  target_id TEXT DEFAULT NULL,
  props TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(props)),
  client_ts TEXT DEFAULT NULL,
  server_ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (event_id)
);

CREATE TABLE IF NOT EXISTS analytics_user_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  stat_date TEXT NOT NULL,
  page_view_count INTEGER NOT NULL DEFAULT 0 CHECK (page_view_count >= 0),
  pet_module_expose_count INTEGER NOT NULL DEFAULT 0 CHECK (pet_module_expose_count >= 0),
  pet_adopt_click_count INTEGER NOT NULL DEFAULT 0 CHECK (pet_adopt_click_count >= 0),
  pet_adopt_success_count INTEGER NOT NULL DEFAULT 0 CHECK (pet_adopt_success_count >= 0),
  content_open_count INTEGER NOT NULL DEFAULT 0 CHECK (content_open_count >= 0),
  read_count INTEGER NOT NULL DEFAULT 0 CHECK (read_count >= 0),
  watch_count INTEGER NOT NULL DEFAULT 0 CHECK (watch_count >= 0),
  like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  collect_count INTEGER NOT NULL DEFAULT 0 CHECK (collect_count >= 0),
  level_up_count INTEGER NOT NULL DEFAULT 0 CHECK (level_up_count >= 0),
  travel_start_count INTEGER NOT NULL DEFAULT 0 CHECK (travel_start_count >= 0),
  travel_complete_count INTEGER NOT NULL DEFAULT 0 CHECK (travel_complete_count >= 0),
  travel_claim_count INTEGER NOT NULL DEFAULT 0 CHECK (travel_claim_count >= 0),
  handbook_open_count INTEGER NOT NULL DEFAULT 0 CHECK (handbook_open_count >= 0),
  leaderboard_open_count INTEGER NOT NULL DEFAULT 0 CHECK (leaderboard_open_count >= 0),
  share_click_count INTEGER NOT NULL DEFAULT 0 CHECK (share_click_count >= 0),
  share_success_count INTEGER NOT NULL DEFAULT 0 CHECK (share_success_count >= 0),
  share_refer_count INTEGER NOT NULL DEFAULT 0 CHECK (share_refer_count >= 0),
  onboarding_show_count INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_show_count >= 0),
  onboarding_done_count INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_done_count >= 0),
  onboarding_skip_count INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_skip_count >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_id, stat_date)
);

CREATE TABLE IF NOT EXISTS pet_decay_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decay_window TEXT NOT NULL,
  inactive_hours INTEGER NOT NULL CHECK (inactive_hours > 0),
  satiety_delta INTEGER NOT NULL CHECK (satiety_delta <= 0),
  mood_delta INTEGER NOT NULL CHECK (mood_delta <= 0),
  message TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (decay_window)
);

CREATE TABLE IF NOT EXISTS pet_state_decay_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  decay_window TEXT NOT NULL,
  inactive_since TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  inactive_hours INTEGER NOT NULL CHECK (inactive_hours >= 0),

  satiety_delta INTEGER NOT NULL,
  mood_delta INTEGER NOT NULL,

  before_satiety INTEGER NOT NULL CHECK (before_satiety BETWEEN 0 AND 100),
  after_satiety INTEGER NOT NULL CHECK (after_satiety BETWEEN 0 AND 100),
  before_mood INTEGER NOT NULL CHECK (before_mood BETWEEN 0 AND 100),
  after_mood INTEGER NOT NULL CHECK (after_mood BETWEEN 0 AND 100),

  message TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_id, decay_window, inactive_since)
);

CREATE TABLE IF NOT EXISTS zhihu_content_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('article', 'pin', 'video', 'novel')),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  full_content TEXT NOT NULL,
  read_text TEXT NOT NULL DEFAULT '阅读全文',
  tags TEXT DEFAULT NULL CHECK (tags IS NULL OR json_valid(tags)),
  media_type TEXT DEFAULT NULL CHECK (media_type IS NULL OR media_type IN ('image', 'video', 'novel')),
  media_label TEXT DEFAULT NULL,
  like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  collect_count INTEGER NOT NULL DEFAULT 0 CHECK (collect_count >= 0),
  hot_score INTEGER NOT NULL DEFAULT 0 CHECK (hot_score >= 0),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'hidden')),
  published_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (content_id)
);

CREATE TABLE IF NOT EXISTS zhihu_follow_moment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  moment_key TEXT NOT NULL,

  actor_name TEXT DEFAULT NULL,
  action_text TEXT DEFAULT NULL,
  action_time INTEGER NOT NULL,
  target_title TEXT DEFAULT NULL,
  target_excerpt TEXT DEFAULT NULL,
  target_author_name TEXT DEFAULT NULL,
  raw_payload TEXT NOT NULL CHECK (json_valid(raw_payload)),

  llm_summary_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (llm_summary_status IN ('pending', 'processing', 'ready', 'failed', 'skipped')),
  llm_summary TEXT DEFAULT NULL,
  llm_summary_model TEXT DEFAULT NULL,
  llm_summary_updated_at TEXT DEFAULT NULL,
  llm_retry_count INTEGER NOT NULL DEFAULT 0,
  llm_error TEXT DEFAULT NULL,

  reward_granted INTEGER NOT NULL DEFAULT 0 CHECK (reward_granted IN (0, 1)),
  notified_at TEXT DEFAULT NULL,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_id, moment_key)
);

CREATE TABLE IF NOT EXISTS zhihu_follow_moment_sync (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  last_synced_at TEXT DEFAULT NULL,
  last_seen_action_time INTEGER DEFAULT NULL,
  last_new_count INTEGER NOT NULL DEFAULT 0 CHECK (last_new_count >= 0),
  last_error TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS pet_travel_theme_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme TEXT NOT NULL CHECK (theme IN ('polar', 'hotspot')),
  title TEXT NOT NULL,
  required_level INTEGER NOT NULL DEFAULT 2 CHECK (required_level >= 1),
  energy_cost INTEGER NOT NULL DEFAULT 10 CHECK (energy_cost >= 0),
  duration_sec INTEGER NOT NULL DEFAULT 60 CHECK (duration_sec > 0),
  preferred_tags TEXT NOT NULL CHECK (json_valid(preferred_tags)),
  return_count INTEGER NOT NULL DEFAULT 1 CHECK (return_count >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (theme)
);

CREATE TABLE IF NOT EXISTS pet_travel_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  travel_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  theme TEXT NOT NULL CHECK (theme IN ('polar', 'hotspot')),
  status TEXT NOT NULL
    CHECK (status IN ('traveling', 'returned', 'claimed', 'recalled', 'failed')),
  energy_cost INTEGER NOT NULL DEFAULT 0 CHECK (energy_cost >= 0),
  started_at TEXT NOT NULL,
  expected_return_at TEXT NOT NULL,
  returned_at TEXT DEFAULT NULL,
  claimed_at TEXT DEFAULT NULL,
  message TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (travel_id)
);

CREATE TABLE IF NOT EXISTS pet_travel_external_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  travel_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('follow_moment', 'hot_list')),
  source_ref TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 1 CHECK (rank >= 1),
  title TEXT NOT NULL,
  excerpt TEXT DEFAULT NULL,
  author TEXT DEFAULT NULL,
  url TEXT DEFAULT NULL,
  thumbnail_url TEXT DEFAULT NULL,
  meta TEXT DEFAULT NULL CHECK (meta IS NULL OR json_valid(meta)),
  claimed INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0, 1)),
  reward_exp INTEGER NOT NULL DEFAULT 8 CHECK (reward_exp >= 0),
  reward_mood INTEGER NOT NULL DEFAULT 5 CHECK (reward_mood >= 0),
  reward_energy INTEGER NOT NULL DEFAULT 1 CHECK (reward_energy >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (travel_id, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_pet_travel_external_content_travel
  ON pet_travel_external_content (travel_id, rank);

CREATE TABLE IF NOT EXISTS pet_travel_handbook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  travel_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  theme_title TEXT NOT NULL,
  route_text TEXT NOT NULL,
  pet_quote TEXT NOT NULL,
  cover_style TEXT NOT NULL DEFAULT 'blue',
  llm_summary_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (llm_summary_status IN ('pending', 'processing', 'ready', 'failed', 'skipped')),
  llm_summary TEXT DEFAULT NULL,
  llm_pet_quote TEXT DEFAULT NULL,
  llm_highlights TEXT DEFAULT NULL CHECK (llm_highlights IS NULL OR json_valid(llm_highlights)),
  llm_summary_model TEXT DEFAULT NULL,
  llm_summary_updated_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (travel_id)
);

CREATE INDEX IF NOT EXISTS idx_pet_content_event_user_time
  ON pet_content_event (user_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_pet_content_event_user_content_action
  ON pet_content_event (user_id, content_id, action_type);

CREATE INDEX IF NOT EXISTS idx_pet_content_event_content
  ON pet_content_event (content_id);

CREATE INDEX IF NOT EXISTS idx_pet_growth_log_user_time
  ON pet_growth_log (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pet_growth_log_source
  ON pet_growth_log (source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_pet_daily_stat_date
  ON pet_daily_stat (stat_date);

CREATE INDEX IF NOT EXISTS idx_project_daily_metric_date
  ON project_daily_metric (stat_date);

CREATE INDEX IF NOT EXISTS idx_analytics_event_user_time
  ON analytics_event (user_id, server_ts);

CREATE INDEX IF NOT EXISTS idx_analytics_event_visit_time
  ON analytics_event (visit_id, server_ts);

CREATE INDEX IF NOT EXISTS idx_analytics_event_name_time
  ON analytics_event (event_name, server_ts);

CREATE INDEX IF NOT EXISTS idx_analytics_event_page_time
  ON analytics_event (page_path, server_ts);

CREATE INDEX IF NOT EXISTS idx_analytics_user_daily_date
  ON analytics_user_daily (stat_date);

CREATE INDEX IF NOT EXISTS idx_pet_decay_config_enabled_hours
  ON pet_decay_config (enabled, inactive_hours);

CREATE INDEX IF NOT EXISTS idx_pet_state_decay_log_user_time
  ON pet_state_decay_log (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_zhihu_content_pool_feed
  ON zhihu_content_pool (status, hot_score DESC, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_zhihu_content_pool_type
  ON zhihu_content_pool (content_type, status);

CREATE INDEX IF NOT EXISTS idx_zhihu_follow_moment_user_time
  ON zhihu_follow_moment (user_id, action_time DESC);

CREATE INDEX IF NOT EXISTS idx_zhihu_follow_moment_notify
  ON zhihu_follow_moment (user_id, notified_at, action_time DESC);

CREATE INDEX IF NOT EXISTS idx_zhihu_follow_moment_llm
  ON zhihu_follow_moment (llm_summary_status, action_time DESC);

CREATE INDEX IF NOT EXISTS idx_pet_travel_event_user_status
  ON pet_travel_event (user_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_pet_profile_level_rank
  ON pet_profile (adopted, level DESC, total_exp DESC, updated_at ASC);

CREATE INDEX IF NOT EXISTS idx_pet_level_visual_style
  ON pet_level_visual_config (effect_style, level);

CREATE INDEX IF NOT EXISTS idx_pet_travel_event_rank
  ON pet_travel_event (status, user_id, returned_at DESC, claimed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pet_travel_handbook_user
  ON pet_travel_handbook (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_session_user
  ON auth_session (user_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_oauth_state_expiry
  ON oauth_state (state, expires_at, consumed_at);

INSERT OR IGNORE INTO pet_level_config
  (level, stage, required_total_exp, title, unlock_features)
VALUES
  (1, 'cub', 0, '星途起点', '[]'),
  (2, 'cub', 10, '星章萌新', '[]'),
  (3, 'cub', 120, '星光信使', '[]'),
  (4, 'growing', 250, '行星记录员', '[]'),
  (5, 'growing', 450, '星际见习官', '[]'),
  (6, 'growing', 700, '星图导航员', '[]'),
  (7, 'adult', 1000, '深空开拓者', '[]'),
  (8, 'adult', 1400, '知识探测者', '[]'),
  (9, 'adult', 1900, '星际领航员', '[]'),
  (10, 'advanced', 2500, '宇宙知识领航者', '[]');

INSERT INTO pet_level_visual_config
  (level, stage, title, effect_style, image_url, thumbnail_url, share_bg_url, description)
VALUES
  (1, 'cub', '星途起点', 'cute',
   '/static/assets/pet-level/level-01.png', '/static/assets/pet-level/level-01.png',
   '/static/assets/pet-level/cute-share-bg.svg', '基础红围巾，刚开始陪主人探索知识宇宙'),
  (2, 'cub', '星章萌新', 'cute',
   '/static/assets/pet-level/level-02.png', '/static/assets/pet-level/level-02.png',
   '/static/assets/pet-level/cute-share-bg.svg', '围巾星章点亮，开始积累阅读成就'),
  (3, 'cub', '星光信使', 'cute',
   '/static/assets/pet-level/level-03.png', '/static/assets/pet-level/level-03.png',
   '/static/assets/pet-level/cute-share-bg.svg', '挂上任务星章，进入稳定阅读节奏'),
  (4, 'growing', '行星记录员', 'explore',
   '/static/assets/pet-level/level-04.png', '/static/assets/pet-level/level-04.png',
   '/static/assets/pet-level/explore-share-bg.svg', '戴上航天帽和行星徽章，开始记录知识旅程'),
  (5, 'growing', '星际见习官', 'explore',
   '/static/assets/pet-level/level-05.png', '/static/assets/pet-level/level-05.png',
   '/static/assets/pet-level/explore-share-bg.svg', '背上迷你科考包，准备更远的内容探索'),
  (6, 'growing', '星图导航员', 'explore',
   '/static/assets/pet-level/level-06.png', '/static/assets/pet-level/level-06.png',
   '/static/assets/pet-level/explore-share-bg.svg', '护目镜与指南针就位，能看懂更复杂的知识路线'),
  (7, 'adult', '深空开拓者', 'cool',
   '/static/assets/pet-level/level-07.png', '/static/assets/pet-level/level-07.png',
   '/static/assets/pet-level/cool-share-bg.svg', '带着任务旗帜出发，拥有稳定的深度阅读能力'),
  (8, 'adult', '知识探测者', 'cool',
   '/static/assets/pet-level/level-08.png', '/static/assets/pet-level/level-08.png',
   '/static/assets/pet-level/cool-share-bg.svg', '点亮探测头灯和知识权杖，能发现隐藏的优质内容'),
  (9, 'adult', '星际领航员', 'cool',
   '/static/assets/pet-level/level-09.png', '/static/assets/pet-level/level-09.png',
   '/static/assets/pet-level/cool-share-bg.svg', '蓝金徽章与能量装备成型，进入高阶陪伴状态'),
  (10, 'advanced', '宇宙知识领航者', 'legendary',
   '/static/assets/pet-level/level-10.png', '/static/assets/pet-level/level-10.png',
   '/static/assets/pet-level/legendary-share-bg.svg', '金色星际冠、披风与权杖加身，成为知识宇宙的领航伙伴')
ON CONFLICT(level) DO UPDATE SET
  stage = excluded.stage,
  title = excluded.title,
  effect_style = excluded.effect_style,
  image_url = excluded.image_url,
  thumbnail_url = excluded.thumbnail_url,
  share_bg_url = excluded.share_bg_url,
  description = excluded.description,
  updated_at = CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO pet_travel_theme_config
  (theme, title, required_level, energy_cost, duration_sec, preferred_tags, return_count)
VALUES
  ('polar', '极地旅行', 2, 10, 60, '["科技","科普","AI","学术","知识","冷知识","深度回答"]', 1),
  ('hotspot', '热点旅行', 2, 10, 60, '["热点","社会观察","体育","影视","职场","生活","情感","高赞讨论"]', 1);

INSERT INTO pet_decay_config
  (decay_window, inactive_hours, satiety_delta, mood_delta, message, enabled)
VALUES
  ('8h', 8, -3, -2, '今天还没一起看点内容呢', 1),
  ('24h', 24, -8, -6, '看山的学识值有点低啦', 1),
  ('48h', 48, -15, -12, '看山想和你一起补充新知识', 1)
ON CONFLICT(decay_window) DO UPDATE SET
  inactive_hours = excluded.inactive_hours,
  satiety_delta = excluded.satiety_delta,
  mood_delta = excluded.mood_delta,
  message = excluded.message,
  enabled = excluded.enabled,
  updated_at = CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO zhihu_content_pool
  (content_id, content_type, title, author, excerpt, full_content, read_text, tags, media_type, media_label,
   like_count, comment_count, collect_count, hot_score, status, published_at)
VALUES
  (
    'article_ai_bonus_001',
    'article',
    '为什么我们总怪父母没抓住房产和互联网红利，可轮到自己面对 AI 时代红利时，也开始犹豫了？',
    '青山布衣',
    '永动机的坑，你父母踩了吗？君子兰的坑，你父母踩了吗？各种传销的坑，你父母踩了吗？p2p 理财的坑，你父母踩了吗？巅峰中石油的坑，你父母踩了吗？',
    '永动机的坑，你父母踩了吗？君子兰的坑，你父母踩了吗？各种传销的坑，你父母踩了吗？p2p 理财的坑，你父母踩了吗？巅峰中石油的坑，你父母踩了吗？\n\n每一代人都会在时代机会面前犹豫。父母那代人未必是不努力，而是他们面对的是陌生的信息、巨大的不确定性和有限的判断工具。轮到 AI 时，我们也一样会担心泡沫、担心投入没有回报、担心自己只是追逐热闹。\n\n真正重要的不是每一次红利都押中，而是在变化刚发生时，愿意用低成本的方式去理解它、试用它、建立自己的判断。比起下注，更重要的是保持学习和参与。',
    '阅读全文',
    '["AI","社会观察","长期主义"]',
    NULL,
    NULL,
    5492,
    284,
    700,
    980,
    'published',
    '2026-05-08T09:00:00+08:00'
  ),
  (
    'pin_lks_002',
    'pin',
    '刘看山陪审团正式上线',
    '看山七子',
    '3 个刘看山化身 AI 助手，帮你拆解知乎复杂讨论，一眼看清共识与争议，从此告别信息焦虑，在结构里表达自己。',
    '「刘看山陪审团」正式上线！\n\n3 个刘看山化身 AI 助手，分别从事实、观点和表达三个角度帮你拆解复杂讨论。它不会替你下结论，而是把问题里的共识、分歧、证据和情绪层层展开。\n\n我们希望它成为一个轻量的思考伙伴：当信息太多时，先帮你看清结构；当观点太冲时，先帮你辨认问题；当你想表达时，帮你把想法整理得更稳一点。',
    '查看想法',
    '["想法","AI","社区"]',
    NULL,
    NULL,
    103,
    22,
    18,
    760,
    'published',
    '2026-05-08T10:00:00+08:00'
  ),
  (
    'video_sports_003',
    'video',
    '防守，还得是防守',
    '静易墨',
    '雷霆 VS 湖人 G1 湖人打得还行，算是有备而来。湖人躲 SGA 造犯规应该是练过的，全场让 SGA 只拿 18 分的同时，还让他交出了不少艰难选择。',
    '这是一段视频内容的文字摘要。\n\n雷霆 VS 湖人 G1，湖人的防守选择比预期更有针对性。他们并不是简单堆人数，而是在 SGA 最舒服的起手点上提前做干扰，同时尽量避免无谓犯规。\n\n真正值得看的是轮转细节：弱侧补位、上线延误、底角回收，每一个动作都不华丽，但会不断压缩对手的选择空间。防守，还得是防守。',
    '观看视频',
    '["视频","篮球","体育"]',
    'video',
    '视频内容\n点击观看',
    761,
    76,
    34,
    720,
    'published',
    '2026-05-08T11:00:00+08:00'
  ),
  (
    'novel_future_004',
    'novel',
    '她把月光装进口袋，醒来后全城都停电了',
    '盐选故事',
    '凌晨三点，林岚听见窗外有人敲玻璃。她以为是风，直到那只银色纸鹤落在桌面，说出第一句人话：别打开冰箱。',
    '凌晨三点，林岚听见窗外有人敲玻璃。\n\n她以为是风，直到那只银色纸鹤落在桌面，说出第一句人话：别打开冰箱。\n\n冰箱里没有食物，只有一团安静发亮的月光。她伸手碰了一下，整座城市的灯在同一秒熄灭。黑暗里，楼下传来很多窗户同时打开的声音。有人喊：谁把月亮偷走了？\n\n林岚低头看见自己的口袋鼓了起来，像装着一颗很小的星球。',
    '阅读小说',
    '["小说","悬疑","盐选"]',
    'novel',
    '盐选小说\n点击阅读',
    928,
    91,
    305,
    680,
    'published',
    '2026-05-08T12:00:00+08:00'
  );

COMMIT;

-- R3 评论 LLM 辅助：每次 AI 建议的生命周期日志
CREATE TABLE IF NOT EXISTS pet_comment_assist_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  prompt_payload TEXT NOT NULL,
  suggested_comment TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'streaming'
    CHECK (status IN ('streaming','ready','failed','used','discarded')),
  model TEXT DEFAULT NULL,
  final_comment TEXT DEFAULT NULL,
  used_as_is INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comment_assist_user_content
  ON pet_comment_assist_log(user_id, content_id);
CREATE INDEX IF NOT EXISTS idx_comment_assist_user_streaming
  ON pet_comment_assist_log(user_id, content_id, status);

-- R4 关注动态 LLM 总结：每次 sync 的"扫一眼关注 tab"聚合句
CREATE TABLE IF NOT EXISTS pet_follow_moment_overview (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sync_batch_id TEXT NOT NULL,
  overview_text TEXT NOT NULL DEFAULT '',
  moment_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready','failed','skipped')),
  model TEXT DEFAULT NULL,
  consumed_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_follow_overview_user_unconsumed
  ON pet_follow_moment_overview(user_id, consumed_at);
CREATE INDEX IF NOT EXISTS idx_follow_overview_batch
  ON pet_follow_moment_overview(sync_batch_id);
