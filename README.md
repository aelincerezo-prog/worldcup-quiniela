# ⚽ Quiniela Mundial 2026

Aplicación web completa para una quiniela del Mundial de Fútbol 2026. Diseñada para uso en entorno laboral, accesible desde múltiples usuarios en red local.

---

## Características

| Área | Descripción |
|---|---|
| **Autenticación** | Registro/login con contraseñas hasheadas (bcrypt), sesiones via JWT en cookie httpOnly |
| **Pronósticos** | Marcador exacto por partido, cierre automático 10 min antes del inicio |
| **Puntuación** | 3 pts marcador exacto · 1 pt resultado correcto · 0 pts fallo |
| **Fases** | Grupos → Dieciseisavos → Cuartos → Semis → 3er puesto → Final |
| **Ranking** | Top 5 en portada + tabla completa, se actualiza al registrar resultados |
| **Premios** | Sección editable por el admin para 1er, 2do y 3er lugar |
| **Admin** | Panel para activar fases, registrar resultados y gestionar usuarios |
| **Seguridad** | Helmet, rate-limit, CSRF (SameSite=Strict), queries parametrizadas |
| **Responsive** | Mobile, tablet y escritorio |

---

## Instalación rápida

### Prerrequisitos

- **Node.js ≥ 18** — [nodejs.org](https://nodejs.org)
- **npm** (incluido con Node.js)
- **Windows**: Si `npm install` falla al compilar `better-sqlite3`, instala las Build Tools:
  ```
  npm install --global windows-build-tools
  ```
  O instala "Desktop development with C++" en Visual Studio Installer.

### Pasos

```bash
# 1. Entra al directorio del proyecto
cd worldcup-quiniela

# 2. Instala dependencias
npm install

# 3. Inicia el servidor
npm start
# Modo desarrollo (recarga automática):
npm run dev
```

Abre **http://localhost:3000** en el navegador.

---

## Primer uso

1. **Regístrate** — el primer usuario que se registra es automáticamente **administrador**.
2. Los demás usuarios se registran como participantes normales.
3. El administrador activa fases desde el **Panel Admin**.
4. Los usuarios ingresan pronósticos mientras el partido esté abierto (hasta 10 min antes de iniciar).
5. El admin registra resultados → los puntos se calculan automáticamente.

---

## Variables de entorno (opcional)

Crea un archivo `.env` junto a `server.js`:

```
PORT=3000
JWT_SECRET=tu-secreto-muy-largo-y-aleatorio
NODE_ENV=production
```

> En producción, usa siempre un `JWT_SECRET` fuerte y aleatorio (mínimo 32 caracteres).

---

## Uso en red local (empresa)

Para que varios usuarios accedan desde la misma red:

```bash
# Encuentra tu IP local
ipconfig          # Windows
ifconfig          # Linux/Mac

# Inicia el servidor (ya escucha en 0.0.0.0)
npm start

# Comparte la URL: http://192.168.x.x:3000
```

---

## Sistema de puntos

| Resultado | Puntos |
|---|---|
| Marcador exacto (ej: 2-1 correcto) | **3 puntos** |
| Ganador o empate correcto (ej: pronosticó 3-0, fue 2-0) | **1 punto** |
| Fallo completo | **0 puntos** |

---

## Estructura del proyecto

```
worldcup-quiniela/
├── server.js        ← Express API (auth, partidos, pronósticos, admin)
├── database.js      ← Esquema SQLite + 48 partidos de fase de grupos
├── package.json
├── quiniela.db      ← Base de datos (creada automáticamente al arrancar)
└── public/
    ├── index.html   ← SPA shell
    ├── style.css    ← Tema oscuro responsive
    └── app.js       ← Lógica frontend (vanilla JS)
```

---

## Seguridad implementada

- **Contraseñas**: bcrypt con 12 rondas (salt automático)
- **Sesiones**: JWT en cookie `httpOnly + SameSite=Strict` (protección CSRF)
- **Headers**: Helmet.js (CSP, X-Frame-Options, HSTS, etc.)
- **Rate limiting**: máx. 15 intentos de login por IP cada 15 minutos
- **SQL**: `better-sqlite3` con queries parametrizadas (sin posibilidad de inyección)
- **XSS**: escape de HTML en todo el contenido renderizado por JS
- **Input**: validación de longitud y tipo en servidor y cliente

---

## Datos iniciales incluidos

- **8 grupos (A–H)**, 4 equipos cada uno, **48 partidos** de fase de grupos con fechas de junio 2026
- **6 fases** del torneo (Grupos activos por defecto, resto desactivadas)
- **3 premios** de ejemplo ("Premio por definir") — edita desde el panel Admin
