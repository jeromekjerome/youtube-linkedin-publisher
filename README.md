# YouTube LinkedIn Publisher

**An n8n automation pipeline that monitors curated YouTube channels, uses Gemini to watch interview videos, and publishes LinkedIn posts with AI-generated graphics to your personal account.**

When newsworthy figures give YouTube interviews, this pipeline automatically extracts the most compelling quotes and insights, writes a high-engagement LinkedIn post, generates a custom graphic, and publishes — all without manual effort.

---

## How It Works

1. **Hourly trigger** fires at :45 past every hour
2. Fetches all active channels from the `youtube_channels` table
3. Pulls each channel's YouTube RSS feed and filters to videos published in the last 24 hours
4. Skips any video already in `processed_videos`
5. Passes the YouTube URL directly to **Gemini 1.5 Pro**, which watches the video and extracts:
   - Speaker name and title
   - Top 5 quotes (verbatim)
   - Key insights (4 bullets)
   - Narrative summary
   - Most surprising/controversial statement
6. **Gemini** writes a 150–200 word LinkedIn post — quote-first, punchy, opinionated (Scott Galloway style)
7. **Gemini** generates a Nano Banana image prompt (Portrait + Quote Card or Conceptual Chalk Drawing)
8. **Gemini image model** (`gemini-3.1-flash-image-preview`) generates the graphic
9. Image is uploaded to WordPress (`pro-se.pro`) for public hosting
10. Post + image published to personal LinkedIn via **GetLate**
11. Video marked as processed in Postgres to prevent duplicates

---

## Architecture

| Layer | Technology |
|---|---|
| Orchestration | n8n (cloud) |
| Video understanding | Google Gemini 1.5 Pro (via REST API) |
| Post writing | Google Gemini Pro (via n8n LangChain agent) |
| Image prompt generation | Google Gemini Pro (via n8n LangChain agent) |
| Image generation | Google Gemini `gemini-3.1-flash-image-preview` |
| Image hosting | WordPress REST API (`pro-se.pro`) |
| LinkedIn publishing | GetLate API |
| Database | Neon Postgres (shared with AI Video Publisher) |

---

## Database Tables

Both tables live in the existing **AI Video Publisher** Neon Postgres database.

### `youtube_channels`
| Column | Type | Description |
|---|---|---|
| `id` | serial | Primary key |
| `channel_id` | varchar(64) | YouTube channel ID (e.g. `UCxxxxxx`) |
| `channel_name` | varchar(255) | Display name |
| `notes` | text | Optional notes about the channel |
| `is_active` | boolean | Set to `false` to pause without deleting |
| `added_at` | timestamptz | When the channel was added |

### `processed_videos`
| Column | Type | Description |
|---|---|---|
| `id` | serial | Primary key |
| `video_id` | varchar(64) | YouTube video ID (unique) |
| `channel_id` | varchar(64) | Source channel ID |
| `video_title` | text | Title of the video |
| `video_url` | text | Full YouTube URL |
| `getlate_post_id` | text | GetLate post ID (for reference) |
| `processed_at` | timestamptz | When it was processed |

---

## ⚙️ Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```env
DATABASE_URL=postgres://...

GEMINI_API_KEY=AIza...

GETLATE_API_KEY=sk_...
GETLATE_PERSONAL_PROFILE_ID=your-getlate-profile-id
GETLATE_PERSONAL_LINKEDIN_ACCOUNT_ID=your-linkedin-account-id
```

> The `.env` file is for running `setup-db.js` locally. The three GetLate/Gemini variables must also be set as **n8n environment variables** so the workflow can reference them via `$env.VARIABLE_NAME`.

### 3. Create database tables

```bash
npm run setup
```

### 4. Add channels to monitor

Connect to your Neon database and insert channels:

```sql
INSERT INTO youtube_channels (channel_id, channel_name, notes)
VALUES
  ('UCxxxxxx', 'Lex Fridman', 'Long-form tech/science interviews'),
  ('UCyyyyyy', 'My First Million', 'Entrepreneur interviews');
```

To find a channel's ID: go to the channel page on YouTube, view source, and search for `"channelId"` — or use a tool like [commentpicker.com/youtube-channel-id.php](https://commentpicker.com/youtube-channel-id.php).

### 5. Import the workflow

1. Open your n8n instance
2. Go to **Workflows → Import from file**
3. Select `workflow.json`
4. Set the following **n8n environment variables** in Settings → Environment Variables:
   - `GEMINI_API_KEY`
   - `GETLATE_API_KEY`
   - `GETLATE_PERSONAL_PROFILE_ID`
   - `GETLATE_PERSONAL_LINKEDIN_ACCOUNT_ID`
5. Verify the existing credentials are connected:
   - `Google Gemini(PaLM) Bluestone Blog` — Google PaLM API
   - `AI Video Publisher` — Postgres (Neon)
   - `PSP Wordpress` — WordPress (pro-se.pro)
6. Activate the workflow

---

## Managing Channels

**Pause a channel** (stops processing without deleting):
```sql
UPDATE youtube_channels SET is_active = false WHERE channel_name = 'Channel Name';
```

**Reactivate a channel:**
```sql
UPDATE youtube_channels SET is_active = true WHERE channel_name = 'Channel Name';
```

**Remove a channel:**
```sql
DELETE FROM youtube_channels WHERE channel_id = 'UCxxxxxx';
```

**Reprocess a video** (remove it from the processed list):
```sql
DELETE FROM processed_videos WHERE video_id = 'VIDEO_ID';
```

---

## LinkedIn Post Style

Posts follow a consistent format optimized for engagement:

1. **Opening quote** — the most compelling verbatim statement from the speaker, in quotation marks
2. **Attribution** — `— Speaker Name, Title`
3. **2–3 insight bullets** — the sharpest takeaways
4. **Closing question** — one provocative question to drive comments
5. **Hashtags** — 3–5 relevant tags

Tone is direct, opinionated, and authoritative — no "I watched this video" openers, no promotional language.

---

## Notes

- **Gemini video understanding** requires the YouTube video to have auto-generated or manual captions enabled. Videos without captions may return incomplete analysis.
- **Image hosting** uses `pro-se.pro` WordPress media library as a CDN for GetLate. Images are uploaded but not attached to any WordPress post.
- The pipeline processes at most one batch of new videos per hour per channel. High-volume channels will catch up over subsequent hours.
- The `ON CONFLICT (video_id) DO NOTHING` clause in the insert query makes the pipeline safe to re-run without creating duplicates.
