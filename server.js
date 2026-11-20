// Hor Anuwad - Santhali translator server using the Google Gemini API
// No npm packages needed (Node 18+).
const http = require("http");
const fs = require("fs");
const path = require("path");

// --- tiny .env loader (local dev only; hosting dashboard sets process.env) ---
try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
} catch (e) {}

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const PUBLIC_DIR = path.resolve(__dirname, "public");

// --- In-memory IP rate limiter (20 requests / 60 seconds per IP) ---
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const rateBuckets = new Map();

// Clean up expired buckets every 5 minutes to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateBuckets.entries()) {
    if (now > entry.resetAt) rateBuckets.delete(ip);
  }
}, 5 * 60 * 1000).unref();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateBuckets.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(ip, entry);
    return { allowed: true, retryAfter: 0 };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true, retryAfter: 0 };
}

async function translateGemini(text, langName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "You are an expert Santhali (Santali, ISO code sat) translator. The input may be written in Ol Chiki, Devanagari, Bengali, Odia or Latin script. Translate it faithfully into the requested language, keeping the meaning and tone. Output ONLY the translation, with no notes, explanations or quotation marks." }]
      },
      contents: [{ role: "user", parts: [{ text: `Translate this Santhali text into ${langName}:\n\n${text}` }] }],
      generationConfig: { temperature: 0.2 }
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "Gemini API error (" + r.status + ")");
  const out = d.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
  if (!out) throw new Error("Gemini returned no text (the content may have been blocked). Try different text.");
  return out;
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function sendJson(res, code, obj, extraHeaders = {}) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(JSON.stringify(obj));
}

http.createServer((req, res) => {
  const pathname = (req.url || "/").split("?")[0];

  // 1. Health check endpoint (for Render health checks & uptime pings)
  if (req.method === "GET" && pathname === "/health") {
    return sendJson(res, 200, {
      status: "ok",
      uptime: Math.floor(process.uptime()),
      model: MODEL,
      apiKeyConfigured: Boolean(API_KEY)
    });
  }

  // 2. Translation API endpoint with rate limiting
  if (req.method === "POST" && pathname === "/api/translate") {
    const ip = getClientIp(req);
    const limit = checkRateLimit(ip);
    if (!limit.allowed) {
      return sendJson(
        res,
        429,
        { error: `Rate limit exceeded. Try again in ${limit.retryAfter}s.` },
        { "Retry-After": String(limit.retryAfter) }
      );
    }

    let body = "";
    req.on("data", c => {
      body += c;
      if (body.length > 20000) req.destroy();
    });
    req.on("end", async () => {
      try {
        const { text, langName } = JSON.parse(body);
        if (!text || !text.trim()) return sendJson(res, 400, { error: "No text provided." });
        if (!langName || typeof langName !== "string") return sendJson(res, 400, { error: "Target language is required." });
        if (!API_KEY) return sendJson(res, 500, { error: "GEMINI_API_KEY is missing on the server." });

        const translation = await translateGemini(text.slice(0, 2000), langName.slice(0, 60));
        sendJson(res, 200, { translation });
      } catch (e) {
        sendJson(res, 500, { error: e.message || "Translation failed." });
      }
    });
    return;
  }

  // 3. Safe static file serving (URL-decoded + path traversal protection)
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    return res.end("Method not allowed");
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    return res.end("Bad request");
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(PUBLIC_DIR, relativePath);

  // Ensure resolvedPath stays strictly inside PUBLIC_DIR
  if (resolvedPath !== PUBLIC_DIR && !resolvedPath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.stat(resolvedPath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.writeHead(404);
      return res.end("Not found");
    }
    fs.readFile(resolvedPath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500);
        return res.end("Server error");
      }
      res.writeHead(200, {
        "content-type": TYPES[path.extname(resolvedPath).toLowerCase()] || "application/octet-stream",
        "x-content-type-options": "nosniff"
      });
      res.end(req.method === "HEAD" ? undefined : data);
    });
  });
}).listen(PORT, HOST, () => {
  console.log(`Hor Anuwad listening on http://${HOST}:${PORT}`);
  console.log("Model:", MODEL, "| API key:", API_KEY ? "configured" : "MISSING");
});