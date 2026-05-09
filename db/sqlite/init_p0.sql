PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS zhihu_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid INTEGER NOT NULL,
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

  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (event_id)
);

CREATE TABLE IF NOT EXISTS pet_growth_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,

  source_type TEXT NOT NULL CHECK (source_type IN ('content_event', 'daily_task', 'manual', 'decay')),
  source_id TEXT NOT NULL,

  change_type TEXT NOT NULL CHECK (change_type IN ('total_exp', 'satiety', 'mood', 'level', 'stage')),
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

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (user_id, stat_date)
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

CREATE INDEX IF NOT EXISTS idx_auth_session_user
  ON auth_session (user_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_oauth_state_expiry
  ON oauth_state (state, expires_at, consumed_at);

INSERT OR IGNORE INTO pet_level_config
  (level, stage, required_total_exp, title, unlock_features)
VALUES
  (1, 'cub', 0, '初识看山', '[]'),
  (2, 'cub', 50, '好奇看山', '[]'),
  (3, 'cub', 120, '认真看山', '[]'),
  (4, 'growing', 250, '成长看山', '[]'),
  (5, 'growing', 450, '陪伴看山', '[]'),
  (6, 'growing', 700, '博闻看山', '[]'),
  (7, 'adult', 1000, '远行看山', '[]'),
  (8, 'adult', 1400, '寻文看山', '[]'),
  (9, 'adult', 1900, '知心看山', '[]'),
  (10, 'advanced', 2500, '进阶看山', '[]');

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
