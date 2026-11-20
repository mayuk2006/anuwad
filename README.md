# Hor Anuwad – Santhali Translator (Gemini API)

Translate Santhali (Ol Chiki / Devanagari / Bengali / Roman) into 30 languages, with voice input.

## Requirements
- Node.js 18 or newer (https://nodejs.org). No `npm install` needed.
- A free Gemini API key: https://aistudio.google.com/apikey

## Run
1. Copy `.env.example` to `.env` and paste your key after `GEMINI_API_KEY=`
2. In this folder run:  `node server.js`
3. Open http://localhost:3000 in **Chrome or Edge** (needed for voice input).

## Structure
- `server.js`      Node server: serves the site and `/api/translate` (calls Gemini, keeps your key private)
- `public/`        Frontend (index.html, style.css, app.js)
- `.env.example`   Settings template

## Troubleshooting
- "model not found": set `GEMINI_MODEL` in `.env` to a current model, e.g. `gemini-3.5-flash`.
- "API key not valid": re-copy the key, with no spaces or quotes, and restart the server.
- Voice input: browsers rarely support Santhali, so choose Hindi or Bengali as the voice language and edit the text.
- Never upload your `.env` file to GitHub.
