'use strict';
/**
 * backup.js — Daily SQLite → GitHub backup
 *
 * Reads the database file, base64-encodes it, and pushes it to a private
 * GitHub repository via the Contents API.  Existing backups at the same path
 * are replaced (PUT with the previous SHA).
 *
 * Required env vars:
 *   GITHUB_BACKUP_TOKEN  — personal access token with repo write scope
 *   GITHUB_BACKUP_OWNER  — GitHub user/org (default: aelincerezo-prog)
 *   GITHUB_BACKUP_REPO   — repository name  (default: quiniela-backups)
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const OWNER = process.env.GITHUB_BACKUP_OWNER || 'aelincerezo-prog';
const REPO  = process.env.GITHUB_BACKUP_REPO  || 'quiniela-backups';

function dbPath() {
  return process.env.NODE_ENV === 'production'
    ? '/app/data/quiniela.db'
    : path.join(__dirname, 'quiniela.db');
}

/** Minimal HTTPS request helper (no external deps). */
function githubRequest(method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path:     urlPath,
      method,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent':    'quiniela-backup/1.0',
        'Accept':        'application/vnd.github.v3+json',
        'Content-Type':  'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runBackup() {
  const token = process.env.GITHUB_BACKUP_TOKEN;
  if (!token) {
    console.warn('[backup] GITHUB_BACKUP_TOKEN no está configurado — omitiendo backup.');
    return;
  }

  const filePath = dbPath();
  if (!fs.existsSync(filePath)) {
    console.warn('[backup] Archivo de base de datos no encontrado:', filePath);
    return;
  }

  // Filename: quiniela-YYYY-MM-DD.db
  const date    = new Date().toISOString().slice(0, 10);
  const name    = `quiniela-${date}.db`;
  const apiPath = `/repos/${OWNER}/${REPO}/contents/${name}`;

  console.log(`[backup] Iniciando backup → ${OWNER}/${REPO}/${name}`);

  // Read and encode DB
  const content = fs.readFileSync(filePath).toString('base64');

  // Check if file already exists (need its SHA to update)
  let sha;
  const getResp = await githubRequest('GET', apiPath, token, null);
  if (getResp.status === 200 && getResp.body.sha) {
    sha = getResp.body.sha;
    console.log(`[backup] Archivo existente encontrado (SHA: ${sha.slice(0,7)}…), actualizando…`);
  }

  const putBody = {
    message: `Backup automático ${date}`,
    content,
    ...(sha ? { sha } : {}),
  };

  const putResp = await githubRequest('PUT', apiPath, token, putBody);
  if (putResp.status === 200 || putResp.status === 201) {
    const url = putResp.body?.content?.html_url || '(sin URL)';
    console.log(`[backup] ✅ Backup completado: ${url}`);
  } else {
    console.error(`[backup] ❌ Error al hacer backup (HTTP ${putResp.status}):`, putResp.body);
  }
}

/**
 * Schedules the backup to run once daily at targetHour:targetMin UTC.
 * Fires immediately on first call if the current time has already passed
 * today's target, it schedules for tomorrow.
 */
function scheduleDailyBackup(targetHour = 3, targetMin = 0) {
  function msUntilNext() {
    const now  = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      targetHour, targetMin, 0, 0
    ));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next - now;
  }

  function schedule() {
    const delay = msUntilNext();
    const hh = String(targetHour).padStart(2, '0');
    const mm = String(targetMin).padStart(2, '0');
    console.log(
      `[backup] Próximo backup programado en ${Math.round(delay / 60000)} min ` +
      `(${hh}:${mm} UTC diariamente)`
    );
    setTimeout(async () => {
      try { await runBackup(); } catch (e) { console.error('[backup] Error inesperado:', e); }
      schedule(); // reschedule for next day
    }, delay);
  }

  schedule();
}

module.exports = { runBackup, scheduleDailyBackup };
