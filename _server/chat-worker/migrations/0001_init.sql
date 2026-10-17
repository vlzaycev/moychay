-- Cha – AI tea assistant: storage (Cloudflare D1, SQLite).
-- Apply: npx wrangler d1 migrations apply teaphuket-chat --remote
-- Personal data is kept to a minimum: no IPs (only salted hashes in counters), no names unless the visitor writes them.
-- Everything is deleted RETENTION_DAYS after the last activity (daily cron, see src/index.js → scheduled).

-- Conversation = ChatSession: one anonymous browser session. The visitor holds a random token;
-- only its SHA-256 is stored, so a database leak does not let anyone read or write into a chat.
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,                 -- 128-bit random hex, internal (Telegram buttons, links)
  code TEXT NOT NULL,                  -- CH-XXXX, shown to staff only
  token_hash TEXT NOT NULL UNIQUE,     -- SHA-256 of the visitor's session token
  lang TEXT NOT NULL,                  -- en | ru | th (interface language)
  status TEXT NOT NULL,                -- ai_active | human_requested | human_active | closed
  start_page TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_activity INTEGER NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,      -- last message number in this conversation
  ai_calls INTEGER NOT NULL DEFAULT 0,
  busy_until INTEGER NOT NULL DEFAULT 0,   -- one AI request at a time per conversation
  operator_id TEXT,
  operator_name TEXT,
  tg_root_message_id INTEGER           -- the support request message in the staff chat
);
CREATE INDEX conversations_activity ON conversations(last_activity);

-- Message: sender = visitor | assistant | operator | system
CREATE TABLE messages (
  conv_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  meta TEXT,                           -- JSON: buttons, translation note, lead flag
  client_id TEXT,                      -- idempotency key from the browser
  created_at INTEGER NOT NULL,
  PRIMARY KEY (conv_id, seq)
);
CREATE UNIQUE INDEX messages_client ON messages(conv_id, client_id) WHERE client_id IS NOT NULL;

-- HandoffRequest: every "talk to a person"
CREATE TABLE handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_id TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  accepted_at INTEGER,
  operator_id TEXT,
  closed_at INTEGER,
  close_reason TEXT                    -- closed | returned_to_ai
);
CREATE INDEX handoffs_conv ON handoffs(conv_id);

-- Which Telegram message in the staff chat belongs to which conversation (reply routing)
CREATE TABLE tg_links (
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  conv_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, message_id)
);
CREATE INDEX tg_links_conv ON tg_links(conv_id);

-- Telegram may deliver the same update twice: each update_id is processed once
CREATE TABLE tg_updates (
  update_id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL
);

-- KnowledgeDocument: business knowledge, uploaded with `npm run kb:push` (no code change needed)
CREATE TABLE knowledge_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT,
  updated_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

-- Daily caps (per hashed IP, per conversation) and one-off flags
CREATE TABLE counters (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);

-- AI usage and errors per day (Asia/Bangkok date) – for cost control
CREATE TABLE usage_daily (
  day TEXT PRIMARY KEY,
  ai_calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  handoffs INTEGER NOT NULL DEFAULT 0
);
