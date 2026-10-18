-- Telegram forum topics: one topic per conversation in the staff group (TELEGRAM_TOPICS=1)
ALTER TABLE conversations ADD COLUMN tg_thread_id INTEGER;
CREATE INDEX conversations_thread ON conversations(tg_thread_id);
