'use strict';
/**
 * One-time admin setup script.
 * Run locally:   node setup-admin.js
 * Run on Railway: railway run node setup-admin.js
 *
 * Deletes ALL users and creates the primary admin account.
 */
const { getDb } = require('./database');

const ADMIN = {
  username: 'ElChaman',
  email:    'aelincerezo@gmail.com',
  // bcrypt hash of the configured password (12 rounds)
  hash: '$2a$12$8MpD7wdXvbFJzdOkNgETqOQRtxsXIgcvZAi7VsvYDZHPg2egKH4ji',
  role: 'admin',
};

const db = getDb();

const { total } = db.prepare('SELECT COUNT(*) AS total FROM users').get();
console.log(`\nUsuarios actuales en BD: ${total}`);

db.prepare('DELETE FROM predictions').run();
console.log('✓ Predicciones eliminadas');
db.prepare('DELETE FROM users').run();
console.log('✓ Todos los usuarios eliminados');

db.prepare(`
  INSERT INTO users (username, password_hash, email, role)
  VALUES (?, ?, ?, ?)
`).run(ADMIN.username, ADMIN.hash, ADMIN.email, ADMIN.role);

console.log(`✓ Admin creado: ${ADMIN.username} <${ADMIN.email}>`);
console.log('\nListo. Ya puedes iniciar sesión.\n');
