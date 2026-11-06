// رفع ملفات الطباعة من الزبائن (عام): نقبل أنواعًا محددة وبحجم محدود، ونتحقق من محتوى الملف
import { hasBlob, putPrint } from "../lib/store.js";
const MAX = 3 * 1024 * 1024, EXT = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};
function magicOk(ext, b) {
  if (ext === "pdf") return b.slice(0, 4).toString() === "%PDF";
  if (ext === "jpg" || ext === "jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === "png") return b.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (ext === "webp") return b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP";
  if (["docx", "pptx", "xlsx"].includes(ext)) return b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
  return b.slice(0, 8).toString("hex") === "d0cf11e0a1b11ae1";
}
const HITS = new Map();
function limited(ip) {
  const now = Date.now(), h = (HITS.get(ip) || []).filter(t => now - t < 600000);
  if (h.length >= 40) { HITS.set(ip, h); return true; }
  h.push(now); HITS.set(ip, h);
  if (HITS.size > 5000) HITS.clear();
  return false;
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "طريقة غير مسموحة" });
  if (!hasBlob()) return res.status(500).json({ error: "خدمة رفع الملفات غير جاهزة حاليًا." });
  const origin = req.headers.origin, host = req.headers["x-forwarded-host"] || req.headers.host;
  if (origin) { try { if (new URL(origin).host !== host) return res.status(403).json({ error: "غير مسموح." }); } catch (e) { return res.status(403).json({ error: "غير مسموح." }); } }
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "x";
  if (limited(ip)) return res.status(429).json({ error: "عدد كبير من الرفع، حاولي بعد قليل." });
  try {
    const b = req.body || {}, name = String(b.name || ""), ext = (name.split(".").pop() || "").toLowerCase();
    if (!EXT[ext]) return res.status(400).json({ error: "نوع الملف غير مدعوم (PDF أو Word أو PowerPoint أو Excel أو صور)." });
    const buf = Buffer.from(String(b.data || ""), "base64");
    if (!buf.length) return res.status(400).json({ error: "الملف فارغ." });
    if (buf.length > MAX) return res.status(413).json({ error: "الملف أكبر من 3 ميجا." });
    if (!magicOk(ext, buf)) return res.status(400).json({ error: "محتوى الملف لا يطابق نوعه." });
    const base = name.slice(0, name.lastIndexOf(".")).replace(/[^\w\u0600-\u06FF-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "file";
    const r = await putPrint(buf, EXT[ext], base, ext);
    return res.json({ url: r.url });
  } catch (e) { return res.status(500).json({ error: "تعذّر رفع الملف." }); }
}
