// name -> [Google/BCP-47 code, speech-synthesis locale]
const LANGS = {
  "English":["en","en-US"],"Hindi":["hi","hi-IN"],"Bengali":["bn","bn-IN"],"Odia":["or","or-IN"],"Assamese":["as","as-IN"],
  "Nepali":["ne","ne-NP"],"Urdu":["ur","ur-PK"],"Marathi":["mr","mr-IN"],"Gujarati":["gu","gu-IN"],"Punjabi":["pa","pa-IN"],
  "Tamil":["ta","ta-IN"],"Telugu":["te","te-IN"],"Kannada":["kn","kn-IN"],"Malayalam":["ml","ml-IN"],"Spanish":["es","es-ES"],
  "French":["fr","fr-FR"],"German":["de","de-DE"],"Italian":["it","it-IT"],"Portuguese":["pt","pt-PT"],"Russian":["ru","ru-RU"],
  "Arabic":["ar","ar-SA"],"Chinese (Simplified)":["zh-CN","zh-CN"],"Japanese":["ja","ja-JP"],"Korean":["ko","ko-KR"],
  "Indonesian":["id","id-ID"],"Turkish":["tr","tr-TR"],"Dutch":["nl","nl-NL"],"Swahili":["sw","sw-KE"],"Thai":["th","th-TH"],"Vietnamese":["vi","vi-VN"]
};
const $ = id => document.getElementById(id);
const to = $("to"), src = $("src"), out = $("out"), st = $("st"), go = $("go");

Object.keys(LANGS).forEach(l => to.add(new Option(l, l)));

// Ol Chiki keypad
"ᱚᱛᱜᱝᱞᱟᱠᱡᱤᱢᱣᱥᱦᱧᱩᱪᱫᱬᱭᱮᱯᱰᱱᱲᱳᱴᱵᱶᱷ᱾ᱹ".split("").forEach(c => {
  const b = document.createElement("button");
  b.className = "btn"; b.textContent = c;
  b.onclick = () => { src.value += c; src.focus(); count(); };
  $("keys").appendChild(b);
});
function count() { $("cnt").textContent = src.value.length + " / 2000"; }
src.oninput = count;
$("clr").onclick = () => { src.value = ""; count(); out.textContent = "Your translation will appear here."; out.className = "out ph"; };

// ---- Voice input (Web Speech API) ----
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
$("mic").onclick = () => {
  if (!SR) { st.textContent = "Voice input is not supported in this browser. Use Chrome or Edge."; return; }
  if (rec) { rec.stop(); return; }
  rec = new SR();
  rec.lang = $("vl").value; rec.interimResults = true; rec.continuous = true;
  const base = src.value;
  rec.onstart = () => { $("mic").classList.add("on"); $("mic").textContent = "⏹ Stop"; st.textContent = "Listening…"; };
  rec.onresult = e => {
    let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
    src.value = (base ? base + " " : "") + t; count();
  };
  rec.onerror = e => { st.textContent = "Voice error: " + e.error + (e.error === "language-not-supported" ? " (choose Hindi or Bengali)" : ""); };
  rec.onend = () => { rec = null; $("mic").classList.remove("on"); $("mic").textContent = "🎤 Voice input"; if (st.textContent === "Listening…") st.textContent = "Ready."; };
  try { rec.start(); } catch (e) { rec = null; }
};

// ---- Translate (calls our Node server) ----
go.onclick = async () => {
  const text = src.value.trim();
  if (!text) { st.textContent = "Please enter or speak some Santhali text."; return; }
  const langName = to.value;
  $("tl").textContent = "Translation · " + langName;
  go.disabled = true; st.textContent = "Translating…"; out.className = "out"; out.textContent = "…";
  try {
    const r = await fetch("/api/translate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, langName, langCode: LANGS[langName][0] })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Request failed");
    out.textContent = d.translation; st.textContent = "Done.";
  } catch (e) {
    out.className = "out ph"; out.textContent = "Translation failed."; st.textContent = e.message;
  }
  go.disabled = false;
};

$("cpy").onclick = async () => {
  try { await navigator.clipboard.writeText(out.textContent); st.textContent = "Copied."; } catch (e) { st.textContent = "Copy not available."; }
};
$("spk").onclick = () => {
  if (!("speechSynthesis" in window) || out.classList.contains("ph")) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(out.textContent);
  u.lang = LANGS[to.value][1]; speechSynthesis.speak(u);
};
