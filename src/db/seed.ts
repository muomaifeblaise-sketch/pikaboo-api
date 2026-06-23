/**
 * PIKABOO — Dev seed
 * Usage: npm run db:seed
 * Creates the 5 demo personas from the frontend + sample posts
 */
import bcrypt from 'bcryptjs';
import { pool, query } from './pool';
import dotenv from 'dotenv';

dotenv.config();

const DEMO_PASSWORD = 'pikaboo123';

const USERS = [
  { username: 'tobi.codes',  email: 'demo@pikaboo.app',     display_name: 'Tobi',  avatar_id: 1,  bio: '✨ building things' },
  { username: 'zee_visuals', email: 'zee@pikaboo.app',       display_name: 'Zee',   avatar_id: 2,  bio: '📸 Visual storyteller | Lagos, NG' },
  { username: 'kosi__',      email: 'kosi@pikaboo.app',      display_name: 'Kosi',  avatar_id: 6,  bio: '🎨 Art & culture enthusiast' },
  { username: 'lara.lens',   email: 'lara@pikaboo.app',      display_name: 'Lara',  avatar_id: 9,  bio: '💻 Code & coffee' },
  { username: 'tomi_cooks',  email: 'tomi@pikaboo.app',      display_name: 'Tomi',  avatar_id: 14, bio: '🍜 Food & vibes' },
  { username: 'dami_moves',  email: 'dami@pikaboo.app',      display_name: 'Dami',  avatar_id: 20, bio: '🌿 Nature & motion' },
];

const POSTS = [
  { author: 'zee_visuals',  caption: 'Golden hour never misses 🌅 #sunset #goldlens', lens_id: 'gold',    media_url: 'https://placeholder.pikaboo.app/gradient/zee-1',    is_spotlight: true  },
  { author: 'lara.lens',    caption: 'Setup goals fr 💻✨ #techlife #codelife',        lens_id: null,      media_url: 'https://placeholder.pikaboo.app/gradient/lara-1',   is_spotlight: false },
  { author: 'tomi_cooks',   caption: 'Jollof rice szn forever 🍜 #foodie #jollof',   lens_id: 'inferno', media_url: 'https://placeholder.pikaboo.app/gradient/tomi-1',   is_spotlight: true  },
  { author: 'dami_moves',   caption: 'Forest trails hit different 🌿 #nature #trail', lens_id: null,      media_url: 'https://placeholder.pikaboo.app/gradient/dami-1',   is_spotlight: true  },
  { author: 'zee_visuals',  caption: 'Studio time 🔥 #infernolens',                   lens_id: 'inferno', media_url: 'https://placeholder.pikaboo.app/gradient/zee-2',    is_spotlight: false },
  { author: 'kosi__',       caption: 'Art day always 🎨 #art #culture',               lens_id: null,      media_url: 'https://placeholder.pikaboo.app/gradient/kosi-1',   is_spotlight: false },
];

const FOLLOWS = [
  ['tobi.codes', 'zee_visuals'],
  ['tobi.codes', 'lara.lens'],
  ['tobi.codes', 'tomi_cooks'],
  ['tobi.codes', 'dami_moves'],
  ['tobi.codes', 'kosi__'],
  ['zee_visuals', 'tobi.codes'],
  ['zee_visuals', 'lara.lens'],
  ['lara.lens', 'zee_visuals'],
  ['tomi_cooks', 'zee_visuals'],
  ['dami_moves', 'lara.lens'],
];

async function seed() {
  console.log('🌱  Seeding database…\n');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // 1. Insert users
  const userMap: Record<string, string> = {};
  for (const u of USERS) {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (username, email, display_name, avatar_id, bio, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [u.username, u.email, u.display_name, u.avatar_id, u.bio, passwordHash]
    );
    userMap[u.username] = rows[0].id;
    console.log(`  👤  ${u.username} → ${rows[0].id}`);
  }

  // 2. Insert follows
  for (const [follower, following] of FOLLOWS) {
    const fId  = userMap[follower];
    const fgId = userMap[following];
    if (!fId || !fgId) continue;
    await query(
      `INSERT INTO follows (follower_id, following_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [fId, fgId]
    );
  }
  console.log(`\n  🔗  ${FOLLOWS.length} follow relationships created`);

  // 3. Insert posts
  for (const p of POSTS) {
    const userId = userMap[p.author];
    if (!userId) continue;
    await query(
      `INSERT INTO posts (user_id, caption, media_url, media_type, lens_id, is_spotlight,
                          like_count, comment_count, view_count)
       VALUES ($1,$2,$3,'image',$4,$5,
               floor(random()*1500)::int,
               floor(random()*200)::int,
               floor(random()*10000)::int)
       ON CONFLICT DO NOTHING`,
      [userId, p.caption, p.media_url, p.lens_id, p.is_spotlight]
    );
  }
  console.log(`  📷  ${POSTS.length} posts created`);

  console.log('\n✅  Seed complete!');
  console.log('   Demo login: demo@pikaboo.app / pikaboo123\n');

  await pool.end();
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
