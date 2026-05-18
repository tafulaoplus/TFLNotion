// GET /api/social/tt-fetch?url=<tiktok profile URL>
// Best-effort TikTok profile scraper — extracts public profile + recent videos without OAuth.
// Note: TikTok rate-limits aggressively; may return empty data on busy edge nodes.
import { applyCors, sendError } from '../_db.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const input = (req.query && req.query.url || '').trim();
  if (!input) return sendError(res, 400, 'missing url');

  // Normalize
  let url = input;
  if (!/^https?:\/\//i.test(url)) {
    if (/^@/.test(url)) url = 'https://www.tiktok.com/' + url;
    else url = 'https://www.tiktok.com/@' + url.replace(/^@/, '');
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
    if (!r.ok) return sendError(res, r.status, 'TikTok fetch failed (' + r.status + ')');
    const html = await r.text();

    // TikTok embeds a JSON blob in <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
    const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return sendError(res, 502, 'parse error: TikTok rehydration JSON not found (may be rate-limited)');
    let parsed;
    try { parsed = JSON.parse(m[1]); }
    catch (e) { return sendError(res, 502, 'parse error: invalid JSON', e); }

    const scope = parsed.__DEFAULT_SCOPE__ || {};
    const userDetail = scope['webapp.user-detail'] || {};
    const user = (userDetail.userInfo && userDetail.userInfo.user) || {};
    const stats = (userDetail.userInfo && userDetail.userInfo.stats) || {};

    const username = user.uniqueId || '';
    const displayName = user.nickname || username || '';
    const avatar = user.avatarLarger || user.avatarMedium || user.avatarThumb || '';
    const bio = user.signature || '';
    const followerCount = stats.followerCount || 0;
    const followingCount = stats.followingCount || 0;
    const videoCount = stats.videoCount || 0;
    const heart = stats.heart || stats.heartCount || 0;

    // Videos — different versions of TikTok payload
    let items = [];
    const itemList = scope['webapp.user-post'] || scope['webapp.user-detail'];
    if (itemList && Array.isArray(itemList.itemList)) items = itemList.itemList;
    else if (userDetail.itemList && Array.isArray(userDetail.itemList)) items = userDetail.itemList;

    const videos = items.slice(0, 24).map(v => ({
      id: v.id,
      title: v.desc || '',
      url: username && v.id ? `https://www.tiktok.com/@${username}/video/${v.id}` : '',
      thumbnail: (v.video && (v.video.cover || v.video.originCover)) || '',
      viewCount: (v.stats && v.stats.playCount) || 0,
      likeCount: (v.stats && v.stats.diggCount) || 0,
      commentCount: (v.stats && v.stats.commentCount) || 0,
      shareCount: (v.stats && v.stats.shareCount) || 0,
      duration: (v.video && v.video.duration) || 0,
      createTime: v.createTime || 0,
    }));

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.json({
      ok: true,
      username,
      displayName,
      avatar,
      bio,
      followerCount,
      followingCount,
      videoCount,
      heartCount: heart,
      url: username ? `https://www.tiktok.com/@${username}` : url,
      videos,
      fetchedAt: Date.now(),
    });
  } catch (e) {
    return sendError(res, 500, 'tt-fetch error', e);
  }
}
