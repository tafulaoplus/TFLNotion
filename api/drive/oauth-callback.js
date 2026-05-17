// GET /api/drive/oauth-callback?code=...&state=...
//   Google OAuth redirect target — exchanges auth code for refresh_token,
//   writes refresh_token + admin email into workspace_snapshot.googleDriveSettings.
//
// Required JSON in workspace_snapshot.data.googleDriveSettings BEFORE first call:
//   { clientId: "...", clientSecret: "...", redirectUri: "https://<host>/api/drive/oauth-callback" }
//
// (Client posts those to /api/workspace first, then opens the auth URL.)
import { sql, sendError, DEFAULT_WORKSPACE } from '../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'Method not allowed');
  }
  const wsId = (req.query && req.query.workspace) || DEFAULT_WORKSPACE;
  const code = req.query && req.query.code;
  const err  = req.query && req.query.error;

  if (err) return htmlResult(res, false, `Google OAuth ปฏิเสธ: ${err}`);
  if (!code) return htmlResult(res, false, 'ไม่พบ authorization code');

  try {
    const rows = await sql`SELECT data FROM workspace_snapshot WHERE workspace_id = ${wsId} LIMIT 1`;
    if (!rows.length) return htmlResult(res, false, 'ไม่พบ workspace snapshot');
    const data = rows[0].data || {};
    const cfg = data.googleDriveSettings || {};
    if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
      return htmlResult(res, false, 'ต้องตั้ง Client ID + Client Secret + Redirect URI ก่อน');
    }

    const params = new URLSearchParams();
    params.set('code', code);
    params.set('client_id', cfg.clientId);
    params.set('client_secret', cfg.clientSecret);
    params.set('redirect_uri', cfg.redirectUri);
    params.set('grant_type', 'authorization_code');

    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const tokJson = await tokRes.json();
    if (!tokRes.ok) {
      return htmlResult(res, false, 'แลก token ไม่สำเร็จ: ' + (tokJson.error_description || tokJson.error || tokRes.status));
    }
    if (!tokJson.refresh_token) {
      return htmlResult(res, false, 'Google ไม่ส่ง refresh_token กลับมา — กดยกเลิกการเข้าถึงในบัญชี Google ก่อน แล้วลองใหม่');
    }

    // Fetch admin email for display
    let adminEmail = '';
    try {
      const meRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
        headers: { Authorization: 'Bearer ' + tokJson.access_token },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        adminEmail = me.email || '';
      }
    } catch (_) {}

    cfg.refreshToken = tokJson.refresh_token;
    cfg.adminEmail = adminEmail;
    cfg.connectedAt = Date.now();
    data.googleDriveSettings = cfg;

    await sql`
      UPDATE workspace_snapshot
      SET data = ${JSON.stringify(data)}::jsonb,
          updated_at = NOW(),
          updated_by = 'drive-oauth'
      WHERE workspace_id = ${wsId}
    `;

    return htmlResult(res, true, `เชื่อมต่อ Google Drive สำเร็จ${adminEmail ? ' ('+adminEmail+')' : ''} — ทุกคนในทีมพร้อมใช้งานได้ทันที`);
  } catch (e) {
    return htmlResult(res, false, 'เกิดข้อผิดพลาด: ' + (e.message || e));
  }
}

function htmlResult(res, ok, msg) {
  const color = ok ? '#059669' : '#dc2626';
  const icon = ok ? '✓' : '✗';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(ok ? 200 : 400).end(`<!doctype html><html><head><meta charset="utf-8"><title>Google Drive Connect</title>
<style>body{font-family:-apple-system,sans-serif;background:#f5f3ff;min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;padding:24px}
.box{background:#fff;border-radius:16px;padding:32px;max-width:480px;text-align:center;box-shadow:0 12px 36px rgba(0,0,0,.08)}
.ic{font-size:48px;color:${color};margin-bottom:12px}
h1{margin:0 0 8px;font-size:20px}
p{color:#475569;margin:0 0 20px;line-height:1.5}
a{display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-weight:700}</style></head>
<body><div class="box"><div class="ic">${icon}</div><h1>${ok?'เชื่อมต่อสำเร็จ':'เชื่อมต่อล้มเหลว'}</h1><p>${msg}</p>
<a href="/">กลับสู่ Workspace →</a></div>
<script>setTimeout(function(){if(window.opener){try{window.opener.postMessage({type:'drive-oauth',ok:${ok}},'*');window.close();}catch(e){}}},${ok?1500:5000});</script>
</body></html>`);
}
