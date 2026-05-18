// GET /api/social/yt-fetch?url=<youtube channel URL>
// Lightweight YouTube channel scraper — extracts public channel + recent videos without OAuth.
// Returns: { ok, channelId, channelTitle, avatar, subscriberText, videoCountText, viewCountText, videos:[{id,title,url,thumbnail,viewCount,publishedAt,duration}] }
import { applyCors, sendError } from '../_db.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function extractJson(html, key) {
  const re = new RegExp(`${key}\\s*=\\s*(\\{[\\s\\S]*?\\});`);
  const m = html.match(re);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const inputUrl = (req.query && req.query.url || '').trim();
  if (!inputUrl) return sendError(res, 400, 'missing url');

  // Normalize: if not a full URL, treat as handle/channel id
  let url = inputUrl;
  if (!/^https?:\/\//i.test(url)) {
    if (/^UC[\w-]{20,}$/.test(url)) url = 'https://www.youtube.com/channel/' + url;
    else if (/^@/.test(url)) url = 'https://www.youtube.com/' + url;
    else url = 'https://www.youtube.com/@' + url.replace(/^@/, '');
  }
  // Force /videos tab when user pastes a bare channel URL — gives us the video grid
  if (!/\/videos\b/.test(url) && !/\/featured\b/.test(url)) {
    url = url.replace(/\/+$/, '') + '/videos';
  }

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!r.ok) return sendError(res, r.status, 'YouTube fetch failed (' + r.status + ')');
    const html = await r.text();

    const data = extractJson(html, 'var ytInitialData');
    if (!data) return sendError(res, 502, 'parse error: ytInitialData not found');

    // --- Channel meta ---
    const meta = (data.metadata && data.metadata.channelMetadataRenderer) || {};
    const headerC4 = data.header && (data.header.c4TabbedHeaderRenderer || (data.header.pageHeaderRenderer && data.header.pageHeaderRenderer.content));
    const channelId = meta.externalId || (headerC4 && headerC4.channelId) || '';
    const channelTitle = meta.title || (headerC4 && (headerC4.title && (headerC4.title.simpleText || (headerC4.title.runs && headerC4.title.runs[0] && headerC4.title.runs[0].text)))) || '';
    let avatar = meta.avatar && meta.avatar.thumbnails && meta.avatar.thumbnails[meta.avatar.thumbnails.length - 1] && meta.avatar.thumbnails[meta.avatar.thumbnails.length - 1].url;
    if (!avatar && headerC4 && headerC4.avatar) avatar = headerC4.avatar.thumbnails && headerC4.avatar.thumbnails[headerC4.avatar.thumbnails.length - 1].url;
    // page header (new layout)
    const pageHeader = data.header && data.header.pageHeaderRenderer;
    let subscriberText = '';
    let videoCountText = '';
    let viewCountText = '';
    if (headerC4) {
      subscriberText = (headerC4.subscriberCountText && (headerC4.subscriberCountText.simpleText || headerC4.subscriberCountText.accessibility?.accessibilityData?.label)) || '';
      videoCountText = (headerC4.videosCountText && headerC4.videosCountText.simpleText) || '';
    }
    // Try newer page-header model (PageHeaderViewModel)
    if (!subscriberText && pageHeader) {
      try {
        const rows = pageHeader.content?.pageHeaderViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
        for (const row of rows) {
          for (const part of (row.metadataParts || [])) {
            const t = part.text?.content || '';
            if (/ผู้ติดตาม|subscriber/i.test(t)) subscriberText = t;
            else if (/วิดีโอ|video/i.test(t) && /\d/.test(t)) videoCountText = t;
          }
        }
      } catch (_) {}
    }

    // --- Videos list ---
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    let items = [];
    for (const t of tabs) {
      const tr = t.tabRenderer;
      if (!tr || !tr.selected) continue;
      const contents = tr.content?.richGridRenderer?.contents
        || tr.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.gridRenderer?.items
        || [];
      items = contents;
      break;
    }
    const videos = [];
    for (const it of items) {
      const v = it.richItemRenderer?.content?.videoRenderer
        || it.richItemRenderer?.content?.reelItemRenderer
        || it.gridVideoRenderer
        || it.videoRenderer;
      if (!v || !v.videoId) continue;
      const thumbs = v.thumbnail?.thumbnails || [];
      videos.push({
        id: v.videoId,
        title: (v.title?.simpleText) || (v.title?.runs?.[0]?.text) || (v.headline?.simpleText) || '',
        url: 'https://www.youtube.com/watch?v=' + v.videoId,
        thumbnail: thumbs[thumbs.length - 1]?.url || '',
        viewCount: v.viewCountText?.simpleText || v.viewCountText?.runs?.[0]?.text || (v.shortViewCountText && v.shortViewCountText.simpleText) || '',
        publishedAt: v.publishedTimeText?.simpleText || '',
        duration: v.lengthText?.simpleText || '',
      });
      if (videos.length >= 24) break;
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.json({
      ok: true,
      channelId,
      channelTitle,
      avatar,
      subscriberText,
      videoCountText,
      viewCountText,
      url: 'https://www.youtube.com/channel/' + channelId,
      videos,
      fetchedAt: Date.now(),
    });
  } catch (e) {
    return sendError(res, 500, 'yt-fetch error', e);
  }
}
