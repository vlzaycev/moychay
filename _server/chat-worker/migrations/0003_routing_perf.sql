-- Topic routing is keyed by the group AND the topic: (tg_chat_id, tg_thread_id) → conversation.
-- Topic ids are only unique inside one group, so the group id is stored with them.
ALTER TABLE conversations ADD COLUMN tg_chat_id TEXT;
UPDATE conversations SET tg_chat_id = (SELECT chat_id FROM tg_links WHERE tg_links.conv_id = conversations.id LIMIT 1) WHERE tg_thread_id IS NOT NULL;
DROP INDEX IF EXISTS conversations_thread;
CREATE UNIQUE INDEX conversations_topic ON conversations(tg_chat_id, tg_thread_id) WHERE tg_thread_id IS NOT NULL;

-- Response times, no message text and no ids: what "fast" means is measured, not guessed.
--   kind = ai | ai_stream   pre: request → AI call, ttft: AI call → first text, ai: AI call → last text, post: → response end
--   kind = tg               pre: Telegram message date → webhook (1 s resolution), total: webhook processing
--   kind = deliver          total: staff message stored → handed to the visitor's browser
CREATE TABLE perf (
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  total INTEGER,
  pre INTEGER,
  ttft INTEGER,
  ai INTEGER,
  post INTEGER
);
CREATE INDEX perf_kind_at ON perf(kind, at);
