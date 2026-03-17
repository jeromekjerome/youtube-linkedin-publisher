import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function setup() {
    console.log('Setting up YouTube LinkedIn Publisher tables in AI Video Publisher DB...\n');

    await sql`
        CREATE TABLE IF NOT EXISTS youtube_channels (
            id            SERIAL PRIMARY KEY,
            channel_id    VARCHAR(64)  NOT NULL UNIQUE,
            channel_name  VARCHAR(255) NOT NULL,
            notes         TEXT,
            is_active     BOOLEAN      NOT NULL DEFAULT true,
            added_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    `;
    console.log('✅ youtube_channels');

    await sql`
        CREATE TABLE IF NOT EXISTS processed_videos (
            id              SERIAL PRIMARY KEY,
            video_id        VARCHAR(64)  NOT NULL UNIQUE,
            channel_id      VARCHAR(64)  NOT NULL,
            video_title     TEXT,
            video_url       TEXT,
            getlate_post_id TEXT,
            processed_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    `;
    console.log('✅ processed_videos');

    console.log('\n🚀 Setup complete. Add channels with:');
    console.log(`   INSERT INTO youtube_channels (channel_id, channel_name) VALUES ('UCxxxxxx', 'Channel Name');`);
    process.exit(0);
}

setup().catch(err => {
    console.error('Setup failed:', err.message);
    process.exit(1);
});
