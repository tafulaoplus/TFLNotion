// Drive proxy — server-side gateway so non-admin team members can list/upload/delete
// Drive files using the admin's stored refresh_token (no per-user Google login).
//
// Endpoints (single function, dispatched by ?op):
//   GET    /api/drive/proxy?op=status               → { connected, adminEmail, folderId }
//   GET    /api/drive/proxy?op=list                 → { files: [...] }
//   POST   /api/drive/proxy?op=upload  body=FormData(file)    → { file }
//   DELETE /api/drive/proxy?op=delete&id=<fileId>   → { ok }
//   POST   /api/drive/proxy?op=disconnect           → { ok }   (admin only — clears refresh_token)
import { sql, applyCors, sendError, DEFAULT_WORKSPACE } from '../_db.js';

export const config = { api: { bodyParser: false } }; // we read multipart manually

const DRIVE_FOLDER_ID = '1nuccKnbDdUjkO-TtpI9Ga0-XiH63dSc_';

// in-memory access_token cache (one cold start = one refresh)
let cachedToken = null;
let cachedExpiresAt = 0;

async function getAccessToken(cfg) {
  const now = Date.now();
  if (cachedToken && cachedExpiresAt > now + 30_000) return cachedToken;
  const params = new URLSearchParams();
  params.set('client_id', cfg.clientId);
  params.set('client_secret', cfg.clientSecret);
  params.set('refresh_token', cfg.refreshToken);
  params.set('grant_type', 'refresh_token');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('refresh_token แลก access_token ไม่สำเร็จ: ' + (j.error_description || j.error || r.status));
  cachedToken = j.access_token;
  cachedExpiresAt = now + (j.expires_in || 3600) * 1000;
  return cachedToken;
}

async function loadConfig(wsId) {
  const rows = await sql`SELECT data->'googleDriveSettings' AS cfg FROM workspace_snapshot WHERE workspace_id = ${wsId} LIMIT 1`;
  if (!rows.length) return null;
  return rows[0].cfg || null;
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Minimal multipart parser — we only need the first file part.
function parseMultipart(buffer, boundary) {
  const bnd = Buffer.from('--' + boundary);
  const end = Buffer.from('--' + boundary + '--');
  let i = buffer.indexOf(bnd);
  if (i < 0) return null;
  i += bnd.length;
  if (buffer.slice(i, i+2).toString() === '\r\n') i += 2;
  const headerEnd = buffer.indexOf('\r\n\r\n', i);
  if (headerEnd < 0) return null;
  const headerStr = buffer.slice(i, headerEnd).toString();
  const dispMatch = headerStr.match(/filename="([^"]+)"/i);
  const ctMatch   = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
  if (!dispMatch) return null;
  const fileName = dispMatch[1];
  const contentType = (ctMatch ? ctMatch[1].trim() : 'application/octet-stream');
  const dataStart = headerEnd + 4;
  let next = buffer.indexOf(bnd, dataStart);
  if (next < 0) next = buffer.indexOf(end, dataStart);
  if (next < 0) return null;
  if (buffer.slice(next-2, next).toString() === '\r\n') next -= 2;
  return { fileName, contentType, fileBuffer: buffer.slice(dataStart, next) };
}

export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const wsId = (req.query && req.query.workspace) || DEFAULT_WORKSPACE;
  const op = req.query && req.query.op;

  try {
    const cfg = await loadConfig(wsId);
    const connected = !!(cfg && cfg.clientId && cfg.clientSecret && cfg.refreshToken);

    if (op === 'status') {
      return res.json({
        ok: true,
        connected,
        adminEmail: (cfg && cfg.adminEmail) || '',
        connectedAt: (cfg && cfg.connectedAt) || 0,
        folderId: DRIVE_FOLDER_ID,
        clientIdSet: !!(cfg && cfg.clientId),
        clientSecretSet: !!(cfg && cfg.clientSecret),
        redirectUri: (cfg && cfg.redirectUri) || '',
      });
    }

    if (!connected) return sendError(res, 412, 'Google Drive ยังไม่ได้เชื่อมต่อ — Admin ต้องเชื่อมที่หน้า "เชื่อมต่อแพลตฟอร์ม" ก่อน');

    const token = await getAccessToken(cfg);

    if (op === 'list' && req.method === 'GET') {
      // Optional override: list files from a different folder (used by "แบบฟอร์ม" page)
      const folderId = (req.query && req.query.folderId) || DRIVE_FOLDER_ID;
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const fields = encodeURIComponent('files(id,name,size,mimeType,createdTime,modifiedTime,thumbnailLink,webViewLink,webContentLink,iconLink)');
      const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=createdTime%20desc&pageSize=200`, {
        headers: { Authorization: 'Bearer ' + token },
      });
      const j = await r.json();
      if (!r.ok) return sendError(res, r.status, 'List ไม่สำเร็จ', j.error || j);
      return res.json({ ok: true, files: j.files || [] });
    }

    if (op === 'upload' && req.method === 'POST') {
      const ct = req.headers['content-type'] || '';
      const m = ct.match(/boundary=(.+)$/);
      if (!m) return sendError(res, 400, 'Missing multipart boundary');
      const raw = await readRawBody(req);
      const part = parseMultipart(raw, m[1].trim());
      if (!part) return sendError(res, 400, 'Parse multipart ล้มเหลว');
      const metadata = { name: part.fileName, parents: [DRIVE_FOLDER_ID] };
      const bdy = '__bnd_' + Date.now();
      const body = Buffer.concat([
        Buffer.from(`--${bdy}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
        Buffer.from(`--${bdy}\r\nContent-Type: ${part.contentType}\r\n\r\n`),
        part.fileBuffer,
        Buffer.from(`\r\n--${bdy}--`),
      ]);
      const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType,createdTime,modifiedTime,thumbnailLink,webViewLink,webContentLink,iconLink', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${bdy}` },
        body,
      });
      const j = await r.json();
      if (!r.ok) return sendError(res, r.status, 'Upload ไม่สำเร็จ', j.error || j);
      return res.json({ ok: true, file: j });
    }

    if (op === 'delete' && req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) return sendError(res, 400, 'missing id');
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + token },
      });
      if (!r.ok && r.status !== 204) {
        let detail; try { detail = await r.json(); } catch { detail = await r.text(); }
        return sendError(res, r.status, 'Delete ไม่สำเร็จ', detail);
      }
      return res.json({ ok: true });
    }

    if (op === 'disconnect' && req.method === 'POST') {
      const rows = await sql`SELECT data FROM workspace_snapshot WHERE workspace_id = ${wsId} LIMIT 1`;
      const data = (rows[0] && rows[0].data) || {};
      data.googleDriveSettings = { clientId:'', clientSecret:'', redirectUri:(cfg && cfg.redirectUri)||'', refreshToken:'', adminEmail:'', connectedAt:0 };
      await sql`UPDATE workspace_snapshot SET data = ${JSON.stringify(data)}::jsonb, updated_at = NOW(), updated_by = 'drive-disconnect' WHERE workspace_id = ${wsId}`;
      cachedToken = null; cachedExpiresAt = 0;
      return res.json({ ok: true });
    }

    return sendError(res, 400, 'Unknown op: ' + op);
  } catch (e) {
    return sendError(res, 500, 'Drive proxy error', e);
  }
}
