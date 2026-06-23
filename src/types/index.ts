// ============================================================
//  PIKABOO — Shared TypeScript types
// ============================================================

// ── DB row types (match schema columns) ─────────────────────

export interface UserRow {
  id:               string;
  username:         string;
  email:            string;
  phone:            string | null;
  password_hash:    string;
  display_name:     string;
  bio:              string | null;
  website:          string | null;
  avatar_id:        number;
  is_private:       boolean;
  is_verified:      boolean;
  is_active:        boolean;
  follower_count:   number;
  following_count:  number;
  post_count:       number;
  last_seen_at:     Date | null;
  created_at:       Date;
  updated_at:       Date;
}

export interface PostRow {
  id:             string;
  user_id:        string;
  caption:        string | null;
  media_url:      string;
  media_type:     'image' | 'video';
  thumbnail_url:  string | null;
  lens_id:        string | null;
  width:          number | null;
  height:         number | null;
  duration_sec:   number | null;
  like_count:     number;
  comment_count:  number;
  share_count:    number;
  save_count:     number;
  view_count:     number;
  is_spotlight:   boolean;
  is_deleted:     boolean;
  location_name:  string | null;
  created_at:     Date;
  updated_at:     Date;
}

export interface CommentRow {
  id:         string;
  post_id:    string;
  user_id:    string;
  parent_id:  string | null;
  body:       string;
  like_count: number;
  is_deleted: boolean;
  created_at: Date;
}

export interface StoryRow {
  id:           string;
  user_id:      string;
  media_url:    string;
  media_type:   'image' | 'video';
  duration_sec: number;
  lens_id:      string | null;
  caption:      string | null;
  view_count:   number;
  status:       'active' | 'expired' | 'deleted';
  expires_at:   Date;
  created_at:   Date;
}

export interface MessageRow {
  id:              string;
  conversation_id: string;
  sender_id:       string;
  body:            string | null;
  media_url:       string | null;
  media_type:      'image' | 'video' | null;
  is_read:         boolean;
  is_deleted:      boolean;
  created_at:      Date;
}

export interface NotificationRow {
  id:         string;
  user_id:    string;
  actor_id:   string | null;
  type:       string;
  post_id:    string | null;
  comment_id: string | null;
  body:       string | null;
  is_read:    boolean;
  created_at: Date;
}

// ── API response shapes ──────────────────────────────────────

export interface PublicUser {
  id:             string;
  username:       string;
  display_name:   string;
  bio:            string | null;
  website:        string | null;
  avatar_id:      number;
  is_private:     boolean;
  is_verified:    boolean;
  follower_count: number;
  following_count:number;
  post_count:     number;
  is_following?:  boolean;   // present when viewing as another user
  created_at:     Date;
}

export interface PublicPost extends Omit<PostRow, 'is_deleted'> {
  author:      PublicUser;
  is_liked?:   boolean;
  is_saved?:   boolean;
}

export interface PublicComment extends CommentRow {
  author: PublicUser;
}

export interface PublicStory extends StoryRow {
  author:    PublicUser;
  is_viewed: boolean;
}

export interface AuthTokens {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?:   T;
  error?:  string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items:    T[];
  total:    number;
  page:     number;
  per_page: number;
  has_more: boolean;
}

// ── Express augmentation ─────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}
