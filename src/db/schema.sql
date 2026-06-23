-- ============================================================
--  PIKABOO — PostgreSQL Schema
--  Run with: psql $DATABASE_URL -f src/db/schema.sql
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- trigram search on usernames/bios

-- ── ENUMS ────────────────────────────────────────────────────

CREATE TYPE media_type    AS ENUM ('image', 'video');
CREATE TYPE story_status  AS ENUM ('active', 'expired', 'deleted');
CREATE TYPE notif_type    AS ENUM (
  'like', 'comment', 'follow', 'mention',
  'comment_reply', 'story_view', 'spotlight_trend', 'system'
);
CREATE TYPE report_reason AS ENUM (
  'spam', 'nudity', 'harassment', 'hate_speech',
  'misinformation', 'violence', 'other'
);

-- ── USERS ────────────────────────────────────────────────────

CREATE TABLE users (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  username          VARCHAR(30) UNIQUE NOT NULL,
  email             VARCHAR(255) UNIQUE NOT NULL,
  phone             VARCHAR(20),
  password_hash     TEXT        NOT NULL,
  display_name      VARCHAR(50) NOT NULL,
  bio               VARCHAR(150),
  website           VARCHAR(100),
  avatar_id         SMALLINT    NOT NULL DEFAULT 1  -- 1-25, maps to Pika avatars
                    CHECK (avatar_id BETWEEN 1 AND 25),
  is_private        BOOLEAN     NOT NULL DEFAULT false,
  is_verified       BOOLEAN     NOT NULL DEFAULT false,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  follower_count    INTEGER     NOT NULL DEFAULT 0,
  following_count   INTEGER     NOT NULL DEFAULT 0,
  post_count        INTEGER     NOT NULL DEFAULT 0,
  last_seen_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast username & email lookups + trigram search
CREATE INDEX idx_users_username     ON users (username);
CREATE INDEX idx_users_email        ON users (email);
CREATE INDEX idx_users_username_trgm ON users USING GIN (username gin_trgm_ops);
CREATE INDEX idx_users_name_trgm    ON users USING GIN (display_name gin_trgm_ops);

-- ── REFRESH TOKENS ───────────────────────────────────────────

CREATE TABLE refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user   ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_hash   ON refresh_tokens (token_hash);

-- ── FOLLOWS ──────────────────────────────────────────────────

CREATE TABLE follows (
  follower_id   UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  following_id  UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX idx_follows_follower  ON follows (follower_id);
CREATE INDEX idx_follows_following ON follows (following_id);

-- ── POSTS ────────────────────────────────────────────────────

CREATE TABLE posts (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  caption       VARCHAR(2200),
  media_url     TEXT        NOT NULL,
  media_type    media_type  NOT NULL DEFAULT 'image',
  thumbnail_url TEXT,                           -- for videos
  lens_id       VARCHAR(30),                   -- e.g. 'gold', 'inferno', 'neon'
  width         INTEGER,
  height        INTEGER,
  duration_sec  NUMERIC(6,2),                  -- video duration
  like_count    INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  share_count   INTEGER NOT NULL DEFAULT 0,
  save_count    INTEGER NOT NULL DEFAULT 0,
  view_count    INTEGER NOT NULL DEFAULT 0,
  is_spotlight  BOOLEAN NOT NULL DEFAULT false, -- appears in Spotlight feed
  is_deleted    BOOLEAN NOT NULL DEFAULT false,
  location_name VARCHAR(100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_user      ON posts (user_id, created_at DESC) WHERE NOT is_deleted;
CREATE INDEX idx_posts_spotlight ON posts (created_at DESC) WHERE is_spotlight AND NOT is_deleted;
CREATE INDEX idx_posts_lens      ON posts (lens_id) WHERE lens_id IS NOT NULL AND NOT is_deleted;

-- ── POST HASHTAGS ─────────────────────────────────────────────

CREATE TABLE hashtags (
  id    SERIAL PRIMARY KEY,
  tag   VARCHAR(100) UNIQUE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE post_hashtags (
  post_id    UUID    NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  hashtag_id INTEGER NOT NULL REFERENCES hashtags (id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, hashtag_id)
);

CREATE INDEX idx_post_hashtags_tag ON post_hashtags (hashtag_id);

-- ── LIKES ────────────────────────────────────────────────────

CREATE TABLE likes (
  user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id    UUID        NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX idx_likes_post ON likes (post_id);

-- ── SAVES ────────────────────────────────────────────────────

CREATE TABLE saves (
  user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id    UUID        NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- ── COMMENTS ─────────────────────────────────────────────────

CREATE TABLE comments (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID        NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  parent_id   UUID        REFERENCES comments (id) ON DELETE CASCADE, -- for replies
  body        VARCHAR(500) NOT NULL,
  like_count  INTEGER NOT NULL DEFAULT 0,
  is_deleted  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_post   ON comments (post_id, created_at ASC) WHERE NOT is_deleted;
CREATE INDEX idx_comments_parent ON comments (parent_id) WHERE parent_id IS NOT NULL;

-- ── STORIES ──────────────────────────────────────────────────

CREATE TABLE stories (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  media_url    TEXT         NOT NULL,
  media_type   media_type   NOT NULL DEFAULT 'image',
  duration_sec NUMERIC(4,1) NOT NULL DEFAULT 5.0,
  lens_id      VARCHAR(30),
  caption      VARCHAR(200),
  view_count   INTEGER      NOT NULL DEFAULT 0,
  status       story_status NOT NULL DEFAULT 'active',
  expires_at   TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stories_user    ON stories (user_id, created_at DESC) WHERE status = 'active';
CREATE INDEX idx_stories_active  ON stories (expires_at) WHERE status = 'active';

CREATE TABLE story_views (
  story_id   UUID        NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
  viewer_id  UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_id)
);

-- ── HUDDLE (MESSAGES) ─────────────────────────────────────────

CREATE TABLE conversations (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_a UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  participant_b UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_msg_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (participant_a, participant_b),
  CHECK (participant_a < participant_b)   -- canonical ordering prevents duplicates
);

CREATE INDEX idx_conversations_a ON conversations (participant_a, last_msg_at DESC);
CREATE INDEX idx_conversations_b ON conversations (participant_b, last_msg_at DESC);

CREATE TABLE messages (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID        NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body            TEXT,
  media_url       TEXT,
  media_type      media_type,
  is_read         BOOLEAN     NOT NULL DEFAULT false,
  is_deleted      BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_convo ON messages (conversation_id, created_at ASC) WHERE NOT is_deleted;

-- ── NOTIFICATIONS ─────────────────────────────────────────────

CREATE TABLE notifications (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  actor_id    UUID        REFERENCES users (id) ON DELETE CASCADE,  -- who triggered it
  type        notif_type  NOT NULL,
  post_id     UUID        REFERENCES posts (id) ON DELETE CASCADE,
  comment_id  UUID        REFERENCES comments (id) ON DELETE CASCADE,
  body        TEXT,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifs_user ON notifications (user_id, created_at DESC) WHERE NOT is_read;

-- ── HIGHLIGHTS ────────────────────────────────────────────────

CREATE TABLE highlights (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      VARCHAR(50) NOT NULL,
  cover_url  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE highlight_stories (
  highlight_id UUID NOT NULL REFERENCES highlights (id) ON DELETE CASCADE,
  story_id     UUID NOT NULL REFERENCES stories  (id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY  (highlight_id, story_id)
);

-- ── BLOCKS & REPORTS ──────────────────────────────────────────

CREATE TABLE blocks (
  blocker_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE reports (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id     UUID          REFERENCES posts (id) ON DELETE CASCADE,
  user_id     UUID          REFERENCES users (id) ON DELETE CASCADE,
  reason      report_reason NOT NULL,
  detail      TEXT,
  resolved    BOOLEAN       NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── LENSES (filter metadata) ──────────────────────────────────

CREATE TABLE lenses (
  id          VARCHAR(30)  PRIMARY KEY,    -- 'gold', 'neon', 'cyber', etc.
  name        VARCHAR(50)  NOT NULL,
  description VARCHAR(200),
  use_count   INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO lenses (id, name, description) VALUES
  ('ethereal', 'Ethereal', 'Soft dreamy glow'),
  ('gold',     'Gold',     'Warm golden tones'),
  ('neon',     'Neon',     'Electric night colours'),
  ('cyber',    'Cyber',    'Cool electric blues'),
  ('inferno',  'Inferno',  'Deep fiery reds'),
  ('glitch',   'Glitch',   'Digital distortion');

-- ── TRIGGERS: keep denormalised counts in sync ────────────────

-- Update user.post_count
CREATE OR REPLACE FUNCTION update_user_post_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET post_count = post_count + 1, updated_at = NOW() WHERE id = NEW.user_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.is_deleted AND NOT OLD.is_deleted THEN
    UPDATE users SET post_count = GREATEST(post_count - 1, 0), updated_at = NOW() WHERE id = NEW.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_post_count
  AFTER INSERT OR UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_user_post_count();

-- Update follow counts
CREATE OR REPLACE FUNCTION update_follow_counts() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET following_count = following_count + 1, updated_at = NOW() WHERE id = NEW.follower_id;
    UPDATE users SET follower_count  = follower_count  + 1, updated_at = NOW() WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE users SET following_count = GREATEST(following_count - 1, 0), updated_at = NOW() WHERE id = OLD.follower_id;
    UPDATE users SET follower_count  = GREATEST(follower_count  - 1, 0), updated_at = NOW() WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_follow_counts
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- Update post like/comment counts
CREATE OR REPLACE FUNCTION update_post_like_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_like_count
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION update_post_like_count();

CREATE OR REPLACE FUNCTION update_post_comment_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.is_deleted AND NOT OLD.is_deleted THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_count
  AFTER INSERT OR UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

-- Auto-update updated_at on users and posts
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_posts_updated_at BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Expire stories automatically (call periodically via cron or pg_cron)
CREATE OR REPLACE FUNCTION expire_stories() RETURNS void AS $$
  UPDATE stories SET status = 'expired'
  WHERE status = 'active' AND expires_at < NOW();
$$ LANGUAGE sql;
