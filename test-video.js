import 'dotenv/config';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VIDEO_URL = process.argv[2] || 'https://www.youtube.com/watch?v=wbQjJ1wMsVM';

if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not set in .env');
    process.exit(1);
}

async function callGemini(model, body) {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }
    );
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${err}`);
    }
    return res.json();
}

function parseJSON(text) {
    try {
        return JSON.parse(text);
    } catch {
        return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    }
}

// ─── Step 0: Fetch transcript ─────────────────────────────────────────────────
async function fetchTranscript(videoUrl) {
    console.log(`\n📝 Step 0: Fetching YouTube transcript...`);

    const videoId = videoUrl.split('v=')[1]?.split('&')[0];
    if (!videoId) throw new Error('Invalid YouTube URL');

    // InnerTube API (Android client) — reliable, no session tokens needed
    const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
        },
        body: JSON.stringify({
            context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
            videoId
        })
    });
    const playerData = await playerRes.json();
    const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks?.length) throw new Error('No caption tracks available — captions may be disabled on this video');

    const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
    const captionRes = await fetch(track.baseUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36' }
    });
    const captionXml = await captionRes.text();

    const transcript = [...captionXml.matchAll(/<s[^>]*>([^<]*)<\/s>/g)]
        .map(m => m[1])
        .join('')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();

    if (!transcript) throw new Error('Empty transcript');

    const wordCount = transcript.split(' ').length;
    console.log(`   ✓ ${wordCount.toLocaleString()} words (~${Math.round(wordCount * 1.3).toLocaleString()} tokens)`);
    return transcript;
}

// ─── Step 1: Analyze transcript ───────────────────────────────────────────────
async function analyzeVideo(transcript) {
    console.log(`\n🎬 Step 1: Analyzing transcript with Gemini...`);

    const response = await callGemini('gemini-2.5-flash', {
        contents: [{
            role: 'user',
            parts: [{
                text: `You are analyzing a YouTube interview transcript for a LinkedIn content creator.

Read this transcript carefully and extract the following. Return ONLY a valid JSON object:
{
  "speaker_name": "Full name of the main guest or interviewee",
  "speaker_title": "Their role, company, or professional description",
  "top_quotes": ["verbatim quote 1", "quote 2", "quote 3", "quote 4", "quote 5"],
  "key_insights": ["insight 1", "insight 2", "insight 3", "insight 4"],
  "narrative_summary": "2-3 sentence arc of the full interview",
  "surprising_statement": "The single most unexpected or provocative thing said"
}

TRANSCRIPT:
${transcript}`
            }]
        }],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json'
        }
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from Gemini analysis');
    return parseJSON(text);
}

// ─── Step 2: Write LinkedIn post ─────────────────────────────────────────────
async function writeLinkedInPost(analysis, videoTitle = '') {
    console.log(`\n✍️  Step 2: Writing LinkedIn post...`);

    const prompt = `You are writing a high-engagement LinkedIn post for a content creator who reposts key insights from YouTube interviews.

## VIDEO DATA
Video Title: ${videoTitle}
Speaker: ${analysis.speaker_name}${analysis.speaker_title ? ', ' + analysis.speaker_title : ''}

Top Quotes:
${analysis.top_quotes.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

Key Insights:
${analysis.key_insights.map((k, i) => `${i + 1}. ${k}`).join('\n')}

Narrative Summary:
${analysis.narrative_summary}

Most Surprising Statement:
${analysis.surprising_statement}

## POST REQUIREMENTS
- 150-200 words total
- Open with the most compelling quote in full quotation marks
- Immediately attribute it: "— ${analysis.speaker_name}"
- Follow with 2-3 punchy insight bullets
- Close with one provocative question to drive comments
- End with 3-5 relevant hashtags on a new line
- Tone: Direct, opinionated, authoritative (think Scott Galloway)
- NO "I watched this video" or "Check this out" openers
- Plain text only

Return ONLY valid JSON with keys: post_text, post_title, hashtags (array).`;

    const response = await callGemini('gemini-2.5-flash', {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json'
        }
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from Gemini post writer');
    return parseJSON(text);
}

// ─── Step 3: Generate image prompt ───────────────────────────────────────────
async function generateImagePrompt(post) {
    console.log(`\n🎨 Step 3: Generating image prompt...`);

    const prompt = `You are an AI Prompting Specialist generating a featured image for a LinkedIn post.

Speaker/Title: ${post.post_title}
Post Preview: ${post.post_text.substring(0, 300)}

Choose the best visual:
- Portrait + Quote Card: Clean modern design, bold quote on abstract background. Best for personal statements.
- Conceptual Chalk Drawing: Dramatic blackboard illustration of the central idea. Best for data or systemic concepts.

Draft a Nano Banana image generation prompt (under 400 words).
- Chalk keywords: "Textured chalk on blackboard", "vibrant pastel colors", "dramatic spotlight", "dusty texture"
- Quote card keywords: "Vector graphic", "flat design", "clean bold typography", "deep navy and gold"
- Include (Aspect Ratio: 1:1) at the end.

Return ONLY valid JSON with keys: nano_banana_prompt (string), key_elements_html (HTML ul string).`;

    const response = await callGemini('gemini-2.5-flash', {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json'
        }
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from Gemini image prompter');
    return parseJSON(text);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  YouTube LinkedIn Publisher — Pipeline Test');
    console.log('═══════════════════════════════════════════════════');

    try {
        const transcript = await fetchTranscript(VIDEO_URL);

        const analysis = await analyzeVideo(transcript);
        console.log('\n📋 Analysis:');
        console.log(`   Speaker:  ${analysis.speaker_name}, ${analysis.speaker_title}`);
        console.log(`   Summary:  ${analysis.narrative_summary}`);
        console.log(`   Quotes:   ${analysis.top_quotes.length} extracted`);
        console.log(`   Insights: ${analysis.key_insights.length} extracted`);
        console.log(`   Surprise: "${analysis.surprising_statement.substring(0, 80)}..."`);

        const post = await writeLinkedInPost(analysis);
        console.log('\n📝 LinkedIn Post:');
        console.log('───────────────────────────────────────────────────');
        console.log(post.post_text);
        console.log('───────────────────────────────────────────────────');
        console.log(`   Title:    ${post.post_title}`);
        console.log(`   Hashtags: ${post.hashtags.map(h => '#' + h).join(' ')}`);
        console.log(`   Words:    ~${post.post_text.split(' ').length}`);

        const imagePrompt = await generateImagePrompt(post);
        console.log('\n🖼️  Image Prompt:');
        console.log('───────────────────────────────────────────────────');
        console.log(imagePrompt.nano_banana_prompt);
        console.log('───────────────────────────────────────────────────');

        console.log('\n✅ Pipeline test complete. All three steps passed.\n');

    } catch (err) {
        console.error('\n❌ Pipeline failed:', err.message);
        process.exit(1);
    }
}

main();
