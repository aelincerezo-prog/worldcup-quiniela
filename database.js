'use strict';
const Database = require('better-sqlite3');

const QUESTIONS = [
  {prompt:'¿Cuál es el número que falta?\n\n2, 4, 6, 8, ___',answer:'10',difficulty:'medium',type:'sequence',explanation:'Son los números pares. Se suma 2 cada vez: 8 + 2 = 10.'},
  {prompt:'¿Cuál es el número que falta?\n\n1, 1, 2, 3, 5, 8, ___, 21',answer:'13',difficulty:'hard',type:'sequence',explanation:'Es la secuencia de Fibonacci. Cada número es la suma de los dos anteriores: 5 + 8 = 13.'},
  {prompt:'¿Cuál es la letra que sigue?\n\nA, C, E, G, ___',answer:'I',difficulty:'medium',type:'letters',explanation:'Son las letras alternas del alfabeto: A(1), C(3), E(5), G(7), I(9).'},
  {prompt:'¿Cuál es el número que falta?\n\n2, 6, 12, 20, 30, ___',answer:'42',difficulty:'hard',type:'sequence',explanation:'Cada término es n×(n+1): 1×2=2, 2×3=6, 3×4=12, 4×5=20, 5×6=30, 6×7=42.'},
  {prompt:'¿Cuál es el número que falta?\n\n1, 4, 9, 16, ___',answer:'25',difficulty:'medium',type:'sequence',explanation:'Son los cuadrados perfectos: 1², 2², 3², 4², 5² = 25.'},
  {prompt:'¿Cuál es el número que falta?\n\n4, 7, 12, 19, 28, ___',answer:'39',difficulty:'hard',type:'sequence',explanation:'Las diferencias aumentan en 2: +3, +5, +7, +9, +11. Entonces 28 + 11 = 39.'},
  {prompt:'¿Cuál es el número que falta?\n\n80, 40, 20, 10, ___',answer:'5',difficulty:'medium',type:'sequence',explanation:'Se divide entre 2 cada vez: 10 ÷ 2 = 5.'},
  {prompt:'¿Cuál es el número que falta?\n\n2, 5, 11, 23, 47, ___',answer:'95',difficulty:'hard',type:'sequence',explanation:'Cada número se multiplica por 2 y se suma 1: 47 × 2 + 1 = 95.'},
  {prompt:'Completa la analogía:\n\n2 es a 6  como  5 es a ___',answer:'15',difficulty:'medium',type:'analogy',explanation:'La relación es multiplicar por 3: 2 × 3 = 6, entonces 5 × 3 = 15.'},
  {prompt:'¿Cuál es el número que falta?\n\n1, 2, 6, 24, 120, ___',answer:'720',difficulty:'hard',type:'sequence',explanation:'Son los factoriales: 1!=1, 2!=2, 3!=6, 4!=24, 5!=120, 6!=720.'},
  {prompt:'¿Cuál es el número que falta?\n\n3, 6, 12, 24, ___',answer:'48',difficulty:'medium',type:'sequence',explanation:'Se multiplica por 2 cada vez: 24 × 2 = 48.'},
  {prompt:'¿Cuál es la letra que sigue?\n\nA, B, D, G, K, ___',answer:'P',difficulty:'hard',type:'letters',explanation:'Las diferencias de posición aumentan en 1: +1, +2, +3, +4, +5. K está en posición 11, más 5 = posición 16 = P.'},
  {prompt:'¿Cuál es la letra que sigue?\n\nZ, Y, X, W, ___',answer:'V',difficulty:'medium',type:'letters',explanation:'Es el alfabeto al revés: Z, Y, X, W, V.'},
  {prompt:'¿Cuál número NO pertenece a la serie?\n\n1, 2, 4, 8, 12, 16',answer:'12',difficulty:'hard',type:'odd_one_out',explanation:'Todos son potencias de 2 (1, 2, 4, 8, 16 = 2⁰,2¹,2²,2³,2⁴) excepto 12.'},
  {prompt:'¿Cuál es el número que falta?\n\n1, 2, 4, 7, 11, ___',answer:'16',difficulty:'medium',type:'sequence',explanation:'Las diferencias aumentan en 1: +1, +2, +3, +4, +5. Entonces 11 + 5 = 16.'},
  {prompt:'¿Cuál es el número que falta?\n\n3, 4, 6, 9, 13, 18, ___',answer:'24',difficulty:'hard',type:'sequence',explanation:'Las diferencias aumentan en 1: +1, +2, +3, +4, +5, +6. Entonces 18 + 6 = 24.'},
  {prompt:'¿Cuál número NO pertenece a la serie?\n\n2, 3, 5, 7, 9',answer:'9',difficulty:'medium',type:'odd_one_out',explanation:'Todos son números primos excepto 9, que es divisible entre 3 (9 = 3 × 3).'},
  {prompt:'¿Cuál es la letra que sigue?\n\nB, C, E, H, L, ___',answer:'Q',difficulty:'hard',type:'letters',explanation:'Las posiciones son 2,3,5,8,12,17. Las diferencias aumentan: +1,+2,+3,+4,+5. Posición 17 = Q.'},
  {prompt:'¿Cuál es el número que falta?\n\n5, 10, 15, 20, ___',answer:'25',difficulty:'medium',type:'sequence',explanation:'Son los múltiplos de 5: 5×1, 5×2, 5×3, 5×4, 5×5 = 25.'},
  {prompt:'¿Cuál es el número que falta?\n\n729, 243, 81, 27, ___',answer:'9',difficulty:'hard',type:'sequence',explanation:'Se divide entre 3 cada vez (potencias de 3): 3⁶, 3⁵, 3⁴, 3³, 3² = 9.'},
  {prompt:'Completa la analogía:\n\n4 es a 16  como  3 es a ___',answer:'9',difficulty:'medium',type:'analogy',explanation:'La relación es el cuadrado del número: 4² = 16, entonces 3² = 9.'},
  {prompt:'¿Cuál es el número que falta?\n\n2, 3, 7, 8, 12, 13, ___',answer:'17',difficulty:'hard',type:'sequence',explanation:'El patrón alterna +1 y +4: 2+1=3, 3+4=7, 7+1=8, 8+4=12, 12+1=13, 13+4=17.'},
  {prompt:'¿Cuál número NO pertenece a la serie?\n\n1, 4, 9, 15, 25',answer:'15',difficulty:'medium',type:'odd_one_out',explanation:'Todos son cuadrados perfectos (1², 2², 3², 5²) excepto 15, que no es cuadrado de ningún entero.'},
  {prompt:'¿Cuál número NO pertenece a la serie?\n\n1, 3, 5, 7, 11, 13, 15',answer:'15',difficulty:'hard',type:'odd_one_out',explanation:'Todos son números primos excepto 15, que es divisible entre 3 y 5 (15 = 3 × 5).'},
  {prompt:'¿Cuál es la letra que sigue?\n\nB, D, F, H, ___',answer:'J',difficulty:'medium',type:'letters',explanation:'Son las letras en posiciones pares: B(2), D(4), F(6), H(8), J(10).'},
  {prompt:'¿Cuál es el número que falta?\n\n6, 10, 15, 21, 28, ___',answer:'36',difficulty:'hard',type:'sequence',explanation:'Las diferencias aumentan: +4, +5, +6, +7, +8. Entonces 28 + 8 = 36.'},
  {prompt:'Completa la analogía:\n\n25 es a 5  como  81 es a ___',answer:'9',difficulty:'medium',type:'analogy',explanation:'La relación es la raíz cuadrada: √25 = 5, entonces √81 = 9.'},
  {prompt:'Completa la analogía:\n\n8 es a 2  como  27 es a ___',answer:'3',difficulty:'hard',type:'analogy',explanation:'La relación es la raíz cúbica: ∛8 = 2, entonces ∛27 = 3.'},
  {prompt:'¿Cuál es la letra que sigue?\n\nC, F, I, L, ___',answer:'O',difficulty:'medium',type:'letters',explanation:'Se avanza 3 posiciones en el alfabeto: C(3), F(6), I(9), L(12), O(15).'},
  {prompt:'¿Cuál es el número que falta?\n\n1, 6, 15, 28, 45, ___',answer:'66',difficulty:'hard',type:'sequence',explanation:'Las diferencias aumentan en 4: +5, +9, +13, +17, +21. Entonces 45 + 21 = 66.'},
  {prompt:'¿Cuál es el número que falta?\n\n0, 1, 3, 6, 10, ___',answer:'15',difficulty:'medium',type:'sequence',explanation:'Son los números triangulares. Las diferencias aumentan: +1, +2, +3, +4, +5. Entonces 10 + 5 = 15.'},
  {prompt:'¿Cuál es el número que falta?\n\n2, 2, 4, 12, 48, ___',answer:'240',difficulty:'hard',type:'sequence',explanation:'Cada término se multiplica por 1, 2, 3, 4, 5: 48 × 5 = 240.'},
  {prompt:'¿Cuál número NO pertenece a la serie?\n\n8, 27, 64, 100, 125',answer:'100',difficulty:'medium',type:'odd_one_out',explanation:'Todos son cubos perfectos (2³, 3³, 4³, 5³) excepto 100.'},
  {prompt:'Completa la analogía:\n\n4 es a 64  como  3 es a ___',answer:'27',difficulty:'hard',type:'analogy',explanation:'La relación es el cubo: 4³ = 64, entonces 3³ = 27.'},
  {prompt:'¿Cuál es el número que falta?\n\n1, 3, 5, 7, 9, ___',answer:'11',difficulty:'medium',type:'sequence',explanation:'Son los números impares consecutivos. Se suma 2 cada vez.'},
  {prompt:'¿Cuál es el número que falta?\n\n16, 14, 11, 7, ___',answer:'2',difficulty:'hard',type:'sequence',explanation:'Las diferencias aumentan: -2, -3, -4, -5. Entonces 7 - 5 = 2.'},
  {prompt:'¿Cuál es el número que falta?\n\n2, 3, 5, 8, 12, ___',answer:'17',difficulty:'medium',type:'sequence',explanation:'Las diferencias aumentan en 1: +1, +2, +3, +4, +5. Entonces 12 + 5 = 17.'},
  {prompt:'¿Cuál es la letra que sigue?\n\nA, C, G, M, ___',answer:'U',difficulty:'hard',type:'letters',explanation:'Las posiciones son 1,3,7,13,21. Las diferencias se duplican: +2,+4,+6,+8. Posición 21 = U.'},
  {prompt:'¿Cuál es el número que falta?\n\n1, 2, 4, 8, 16, ___',answer:'32',difficulty:'medium',type:'sequence',explanation:'Se multiplica por 2 cada vez (potencias de 2): 2⁰, 2¹, 2², 2³, 2⁴, 2⁵ = 32.'},
  {prompt:'¿Cuál es el número que falta?\n\n1, 2, 3, 5, 8, 13, ___, 34',answer:'21',difficulty:'hard',type:'sequence',explanation:'Es la secuencia de Fibonacci. Cada número es la suma de los dos anteriores: 8 + 13 = 21.'},
  {prompt:'Completa la analogía:\n\n2 es a 8  como  3 es a ___',answer:'27',difficulty:'medium',type:'analogy',explanation:'La relación es el cubo: 2³ = 8, entonces 3³ = 27.'},
  {prompt:'¿Cuál número NO pertenece a la serie?\n\n2, 6, 12, 20, 30, 43, 56',answer:'43',difficulty:'hard',type:'odd_one_out',explanation:'La serie es n×(n+1): 1×2=2, 2×3=6, …, 6×7=42, 7×8=56. El 43 no corresponde (debería ser 42).'},
  {prompt:'¿Cuál es la letra que sigue?\n\nA, Z, B, Y, C, ___',answer:'X',difficulty:'medium',type:'letters',explanation:'Alterna inicio y final del alfabeto: A, Z, B, Y, C, X, D, W…'},
  {prompt:'¿Cuál es el número que falta?\n\n1, 5, 14, 30, 55, ___',answer:'91',difficulty:'hard',type:'sequence',explanation:'Las diferencias son cuadrados: +4, +9, +16, +25, +36 (2², 3², 4², 5², 6²). Entonces 55 + 36 = 91.'},
  {prompt:'¿Cuál número NO pertenece a la serie?\n\n3, 6, 9, 14, 15',answer:'14',difficulty:'medium',type:'odd_one_out',explanation:'Todos son múltiplos de 3 excepto 14.'},
  {prompt:'¿Cuál es el número que falta?\n\n3, 5, 11, 29, 83, ___',answer:'245',difficulty:'hard',type:'sequence',explanation:'Cada término se multiplica por 3 y se resta 4: 83 × 3 − 4 = 245.'},
  {prompt:'¿Cuál es el número que falta?\n\n100, 90, 81, 73, ___',answer:'66',difficulty:'medium',type:'sequence',explanation:'Las diferencias disminuyen: -10, -9, -8, -7. Entonces 73 - 7 = 66.'},
  {prompt:'Completa la analogía:\n\n100 es a 10  como  144 es a ___',answer:'12',difficulty:'hard',type:'analogy',explanation:'La relación es la raíz cuadrada: √100 = 10, entonces √144 = 12.'},
  {prompt:'¿Cuál es el número que falta?\n\n7, 14, 21, 28, ___',answer:'35',difficulty:'medium',type:'sequence',explanation:'Son los múltiplos de 7: 7×5 = 35.'},
  {prompt:'¿Cuál es el número que falta?\n\n1, 3, 7, 13, 21, 31, ___',answer:'43',difficulty:'hard',type:'sequence',explanation:'Las diferencias aumentan en 2: +2, +4, +6, +8, +10, +12. Entonces 31 + 12 = 43.'},
  {prompt:'¿Cuál es el número que falta?\n\n50, 45, 40, 35, ___',answer:'30',difficulty:'medium',type:'sequence',explanation:'Se resta 5 cada vez: 35 - 5 = 30.'},
  {prompt:'¿Cuál número NO pertenece a la serie?\n\n4, 9, 16, 25, 35, 49',answer:'35',difficulty:'hard',type:'odd_one_out',explanation:'Todos son cuadrados perfectos (2², 3², 4², 5², 7²) excepto 35.'},
  {prompt:'Completa la analogía:\n\n6 es a 36  como  7 es a ___',answer:'49',difficulty:'medium',type:'analogy',explanation:'La relación es el cuadrado: 6² = 36, entonces 7² = 49.'},
  {prompt:'¿Cuál es el número que falta?\n\n2, 4, 10, 28, 82, ___',answer:'244',difficulty:'hard',type:'sequence',explanation:'Cada término se multiplica por 3 y se resta 2: 82 × 3 − 2 = 244.'},
  {prompt:'¿Cuál número NO pertenece a la serie?\n\n4, 8, 12, 15, 16',answer:'15',difficulty:'medium',type:'odd_one_out',explanation:'Todos son múltiplos de 4 excepto 15.'},
  {prompt:'¿Cuál es el número que falta?\n\n0, 1, 1, 2, 4, 7, 13, ___',answer:'24',difficulty:'hard',type:'sequence',explanation:'Cada número es la suma de los tres anteriores: 4 + 7 + 13 = 24.'},
  {prompt:'¿Cuál es el número que falta?\n\n2, 4, 8, 16, ___',answer:'32',difficulty:'medium',type:'sequence',explanation:'Se multiplica por 2 cada vez: 16 × 2 = 32.'},
  {prompt:'¿Cuál es la letra que sigue?\n\nZ, X, U, Q, ___',answer:'L',difficulty:'hard',type:'letters',explanation:'Las posiciones son 26,24,21,17,12. Las diferencias aumentan: -2,-3,-4,-5. Posición 12 = L.'},
  {prompt:'Completa la analogía:\n\n10 es a 100  como  5 es a ___',answer:'25',difficulty:'medium',type:'analogy',explanation:'La relación es el cuadrado: 10² = 100, entonces 5² = 25.'},
  {prompt:'¿Cuál es el número que falta?\n\n1, 8, 27, 64, ___, 216',answer:'125',difficulty:'hard',type:'sequence',explanation:'Son los cubos perfectos: 1³, 2³, 3³, 4³, 5³=125, 6³=216.'},
];
const path = require('path');
const fs   = require('fs');

let db;

function getDb() {
  if (!db) {
    const dbPath = process.env.NODE_ENV === 'production'
      ? '/app/data/quiniela.db'
      : path.join(__dirname, 'quiniela.db');
    // Ensure the data directory exists (required if Railway volume is mounted)
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    seedData();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT    NOT NULL,
      email         TEXT,
      role          TEXT    NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS phases (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    UNIQUE NOT NULL,
      display_name TEXT    NOT NULL,
      is_active    INTEGER NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phase_id    INTEGER NOT NULL REFERENCES phases(id),
      group_name  TEXT,
      home_team   TEXT    NOT NULL,
      away_team   TEXT    NOT NULL,
      home_flag   TEXT    NOT NULL DEFAULT '',
      away_flag   TEXT    NOT NULL DEFAULT '',
      match_date  TEXT    NOT NULL,
      home_score  INTEGER,
      away_score  INTEGER,
      is_finished INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      match_id   INTEGER NOT NULL REFERENCES matches(id),
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      points     INTEGER,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, match_id)
    );

    CREATE TABLE IF NOT EXISTS prizes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      position    INTEGER UNIQUE NOT NULL,
      description TEXT    NOT NULL
    );
  `);
  // Migration: add email column if it doesn't exist yet
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('email')) {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  }

  // Game tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt      TEXT    NOT NULL,
      answer      TEXT    NOT NULL,
      difficulty  TEXT    NOT NULL CHECK(difficulty IN ('medium','hard')),
      type        TEXT    NOT NULL,
      explanation TEXT    NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_answers (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL REFERENCES users(id),
      question_id      INTEGER NOT NULL REFERENCES questions(id),
      answer_date      TEXT    NOT NULL,
      submitted_answer TEXT    NOT NULL,
      correct          INTEGER NOT NULL DEFAULT 0,
      points           INTEGER NOT NULL DEFAULT 0,
      answered_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, answer_date)
    );
    CREATE TABLE IF NOT EXISTS poll_votes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id),
      vote       TEXT    NOT NULL CHECK(vote IN ('si','no')),
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  if (db.prepare('SELECT COUNT(*) as n FROM questions').get().n === 0) {
    const insQ = db.prepare('INSERT INTO questions (prompt,answer,difficulty,type,explanation) VALUES (?,?,?,?,?)');
    const seedQuestions = db.transaction(() => {
      for (const q of QUESTIONS) insQ.run(q.prompt, q.answer, q.difficulty, q.type, q.explanation);
    });
    seedQuestions();
  }

  // Migration: insert missing "Octavos de Final" phase between Dieciseisavos y Cuartos
  const hasOctavos = db.prepare("SELECT id FROM phases WHERE name = 'octavos'").get();
  if (!hasOctavos) {
    const hasDieciseisavos = db.prepare("SELECT id FROM phases WHERE name = 'round_of_16'").get();
    if (hasDieciseisavos) {
      // Shift sort_order of all phases after Dieciseisavos to make room
      db.prepare("UPDATE phases SET sort_order = sort_order + 1 WHERE sort_order >= 3").run();
      db.prepare("INSERT INTO phases (name, display_name, is_active, sort_order) VALUES ('octavos','Octavos de Final',0,3)").run();
    }
  }
}

function seedData() {
  if (db.prepare('SELECT COUNT(*) as n FROM phases').get().n > 0) return;

  // Phases
  const insPhase = db.prepare(
    'INSERT INTO phases (name, display_name, is_active, sort_order) VALUES (?, ?, ?, ?)'
  );
  const phaseIds = {};
  for (const [name, label, active, order] of [
    ['group',          'Fase de Grupos',        1, 1],
    ['round_of_16',    'Dieciseisavos',          0, 2],
    ['octavos',        'Octavos de Final',       0, 3],
    ['quarter_finals', 'Cuartos de Final',       0, 4],
    ['semi_finals',    'Semifinales',            0, 5],
    ['third_place',    'Tercer Puesto',          0, 6],
    ['final',          'Final',                  0, 7],
  ]) {
    phaseIds[name] = insPhase.run(name, label, active, order).lastInsertRowid;
  }

  // Group stage matches  [homeTeam, homeFlag, awayTeam, awayFlag, date]
  const insMatch = db.prepare(`
    INSERT INTO matches (phase_id, group_name, home_team, away_team, home_flag, away_flag, match_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const gid = phaseIds['group'];

  const groups = {
    A: [
      ['México',         '🇲🇽', 'Polonia',        '🇵🇱', '2026-06-11T18:00'],
      ['Arabia Saudita', '🇸🇦', 'Islandia',       '🇮🇸', '2026-06-11T21:00'],
      ['México',         '🇲🇽', 'Islandia',       '🇮🇸', '2026-06-15T18:00'],
      ['Polonia',        '🇵🇱', 'Arabia Saudita', '🇸🇦', '2026-06-15T21:00'],
      ['Islandia',       '🇮🇸', 'Polonia',        '🇵🇱', '2026-06-19T18:00'],
      ['Arabia Saudita', '🇸🇦', 'México',         '🇲🇽', '2026-06-19T18:00'],
    ],
    B: [
      ['Argentina', '🇦🇷', 'Australia', '🇦🇺', '2026-06-12T13:00'],
      ['Francia',   '🇫🇷', 'Túnez',    '🇹🇳', '2026-06-12T16:00'],
      ['Argentina', '🇦🇷', 'Francia',   '🇫🇷', '2026-06-16T13:00'],
      ['Australia', '🇦🇺', 'Túnez',    '🇹🇳', '2026-06-16T16:00'],
      ['Francia',   '🇫🇷', 'Australia', '🇦🇺', '2026-06-20T13:00'],
      ['Túnez',    '🇹🇳', 'Argentina', '🇦🇷', '2026-06-20T13:00'],
    ],
    C: [
      ['España',     '🇪🇸', 'Japón',      '🇯🇵', '2026-06-12T19:00'],
      ['Alemania',   '🇩🇪', 'Costa Rica', '🇨🇷', '2026-06-12T22:00'],
      ['España',     '🇪🇸', 'Alemania',   '🇩🇪', '2026-06-16T19:00'],
      ['Japón',      '🇯🇵', 'Costa Rica', '🇨🇷', '2026-06-16T22:00'],
      ['Alemania',   '🇩🇪', 'Japón',      '🇯🇵', '2026-06-20T19:00'],
      ['Costa Rica', '🇨🇷', 'España',     '🇪🇸', '2026-06-20T19:00'],
    ],
    D: [
      ['Brasil',  '🇧🇷', 'Serbia',  '🇷🇸', '2026-06-13T13:00'],
      ['Suiza',   '🇨🇭', 'Camerún', '🇨🇲', '2026-06-13T16:00'],
      ['Brasil',  '🇧🇷', 'Suiza',   '🇨🇭', '2026-06-17T13:00'],
      ['Camerún', '🇨🇲', 'Serbia',  '🇷🇸', '2026-06-17T16:00'],
      ['Suiza',   '🇨🇭', 'Serbia',  '🇷🇸', '2026-06-21T13:00'],
      ['Camerún', '🇨🇲', 'Brasil',  '🇧🇷', '2026-06-21T13:00'],
    ],
    E: [
      ['Inglaterra',     '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Irán',          '🇮🇷', '2026-06-13T19:00'],
      ['Estados Unidos', '🇺🇸', 'Gales',         '🏴󠁧󠁢󠁷󠁬󠁳󠁿', '2026-06-13T22:00'],
      ['Inglaterra',     '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Estados Unidos','🇺🇸', '2026-06-17T19:00'],
      ['Irán',           '🇮🇷', 'Gales',         '🏴󠁧󠁢󠁷󠁬󠁳󠁿', '2026-06-17T22:00'],
      ['Irán',           '🇮🇷', 'Estados Unidos','🇺🇸', '2026-06-21T19:00'],
      ['Gales',          '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Inglaterra',    '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '2026-06-21T19:00'],
    ],
    F: [
      ['Bélgica', '🇧🇪', 'Canadá',  '🇨🇦', '2026-06-14T13:00'],
      ['Croacia', '🇭🇷', 'Senegal', '🇸🇳', '2026-06-14T16:00'],
      ['Bélgica', '🇧🇪', 'Croacia', '🇭🇷', '2026-06-18T13:00'],
      ['Canadá',  '🇨🇦', 'Senegal', '🇸🇳', '2026-06-18T16:00'],
      ['Croacia', '🇭🇷', 'Canadá',  '🇨🇦', '2026-06-22T13:00'],
      ['Senegal', '🇸🇳', 'Bélgica', '🇧🇪', '2026-06-22T13:00'],
    ],
    G: [
      ['Países Bajos', '🇳🇱', 'Ecuador',     '🇪🇨', '2026-06-14T19:00'],
      ['Portugal',     '🇵🇹', 'Ghana',        '🇬🇭', '2026-06-14T22:00'],
      ['Países Bajos', '🇳🇱', 'Portugal',     '🇵🇹', '2026-06-18T19:00'],
      ['Ecuador',      '🇪🇨', 'Ghana',        '🇬🇭', '2026-06-18T22:00'],
      ['Portugal',     '🇵🇹', 'Ecuador',      '🇪🇨', '2026-06-22T19:00'],
      ['Ghana',        '🇬🇭', 'Países Bajos', '🇳🇱', '2026-06-22T19:00'],
    ],
    H: [
      ['Uruguay',       '🇺🇾', 'Corea del Sur', '🇰🇷', '2026-06-15T13:00'],
      ['Colombia',      '🇨🇴', 'Qatar',         '🇶🇦', '2026-06-15T16:00'],
      ['Uruguay',       '🇺🇾', 'Colombia',      '🇨🇴', '2026-06-19T13:00'],
      ['Corea del Sur', '🇰🇷', 'Qatar',         '🇶🇦', '2026-06-19T16:00'],
      ['Colombia',      '🇨🇴', 'Corea del Sur', '🇰🇷', '2026-06-23T13:00'],
      ['Qatar',         '🇶🇦', 'Uruguay',       '🇺🇾', '2026-06-23T13:00'],
    ],
  };

  for (const [group, matches] of Object.entries(groups)) {
    for (const [ht, hf, at, af, date] of matches) {
      insMatch.run(gid, group, ht, at, hf, af, date);
    }
  }

  // Default prizes
  const insPrize = db.prepare('INSERT INTO prizes (position, description) VALUES (?, ?)');
  insPrize.run(1, '🥇 Primer Lugar — Premio por definir');
  insPrize.run(2, '🥈 Segundo Lugar — Premio por definir');
  insPrize.run(3, '🥉 Tercer Lugar — Premio por definir');
  insPrize.run(4, '🥉 Tercer Lugar — Premio por definir');
}

module.exports = { getDb };
