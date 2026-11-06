// تخزين المنتجات والإعدادات في Vercel Blob مع نسخة أولية من products.js
import { put, list as blobList, del } from "@vercel/blob";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const KEY = "data/products.json", SKEY = "data/settings.json";
const DEFAULT_CATS = [
  { key: "school", name: "أدوات مدرسية", prefix: "SC" }, { key: "office", name: "أدوات مكتبية", prefix: "OF" },
  { key: "notebooks", name: "كراريس ودفاتر", prefix: "NB" }, { key: "gifts", name: "هدايا وألعاب", prefix: "GF" }
];
export const CATS = Object.fromEntries(DEFAULT_CATS.map(c => [c.key, c.name]));
export const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const gm = q => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);

export const DEFAULTS = {
  title: "مكتبة الكوثر", subtitle: "أدوات مكتبية ومدرسية وخدمات الطباعة", logo: "", accent: "#1b5e4b",
  wa: "201094125754", phone: "01094125754", phone2: "01020076610", addr: "الأبعادية - دمنهور - أمام المدرسة الإعدادية",
  fb: "https://www.facebook.com/profile.php?id=61595996276169", ig: "", tg: "",
  announce: { on: false, text: "", link: "" }, categories: DEFAULT_CATS, showBest: true, showNew: true,
  printEnabled: true, printInfo: "", printKeepDays: 7,
  branches: [{ name: "مكتبة الكوثر - الأبعادية", addr: "الأبعادية - دمنهور - أمام المدرسة الإعدادية", phone: "01094125754", map: gm("مكتبة الكوثر الأبعادية دمنهور") }]
};
// الأقسام: قائمة {key,name,prefix}. نقرأ الصيغة القديمة (cats) أيضًا للتوافق
export function catsOf(st) {
  if (st && Array.isArray(st.categories) && st.categories.length) return st.categories;
  const old = (st && st.cats) || {};
  return DEFAULT_CATS.map(c => ({ ...c, name: old[c.key] || c.name }));
}
export const mergeSettings = st => {
  const m = { ...DEFAULTS, ...(st || {}), announce: { ...DEFAULTS.announce, ...((st && st.announce) || {}) } };
  m.categories = catsOf(st); m.cats = Object.fromEntries(m.categories.map(c => [c.key, c.name]));
  return m;
};

export function seed() {
  try { const w = {}; new Function("window", fs.readFileSync(path.join(process.cwd(), "products.js"), "utf8"))(w); return w.PRODUCTS || []; }
  catch (e) { return []; }
}
// قراءة بدون عمليات list في الغالب (لتوفير حصة Blob): نبني رابط الملف مباشرة، ونرجع للـlist فقط عند الحاجة
let ORIGIN = null; const MISS = {};
function guessOrigin() { const id = (process.env.BLOB_READ_WRITE_TOKEN || "").split("_")[3]; return id ? "https://" + id.toLowerCase() + ".public.blob.vercel-storage.com" : null; }
async function viaList(key, v) {
  const { blobs } = await blobList({ prefix: key, limit: 5 });
  const b = blobs.find(x => x.pathname === key);
  if (!b) return null;
  ORIGIN = new URL(b.url).origin;
  const r = await fetch(b.url + "?v=" + v, { cache: "no-store" });
  if (!r.ok) throw new Error("تعذّر قراءة البيانات (" + r.status + ")");
  return r.json();
}
// يرجع null لو الملف غير موجود، ويرمي خطأ لو فشلت القراءة. fresh=true للوحة التحكم (بدون كاش)
async function readJson(key, fresh) {
  const v = fresh ? Date.now() : Math.floor(Date.now() / 30000), o = ORIGIN || guessOrigin();
  if (o) { try { const r = await fetch(o + "/" + key + "?v=" + v, { cache: "no-store" }); if (r.ok) return await r.json(); } catch (e) {} }
  if (!fresh && MISS[key] && Date.now() - MISS[key] < 300000) return null;
  const d = await viaList(key, v);
  if (d === null) MISS[key] = Date.now(); else delete MISS[key];
  return d;
}
const writeJson = (key, obj) => { delete MISS[key]; return put(key, JSON.stringify(obj), { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 }); };

// strict=true: أي خطأ في القراءة يوقف العملية (حتى لا نكتب فوق بيانات سليمة)
export async function readList({ strict = false } = {}) {
  if (!hasBlob()) return { list: seed(), source: "seed" };
  try {
    const d = await readJson(KEY, strict);
    if (!d) return { list: seed(), source: "seed" };
    return { list: Array.isArray(d) ? d : (d.products || []), source: "blob" };
  } catch (e) { if (strict) throw e; return { list: seed(), source: "seed" }; }
}
export const writeList = list => writeJson(KEY, { products: list });

export async function readSettings({ strict = false } = {}) {
  if (!hasBlob()) return { settings: mergeSettings(null), source: "default" };
  try {
    const d = await readJson(SKEY, strict);
    return d ? { settings: mergeSettings(d), source: "blob" } : { settings: mergeSettings(null), source: "default" };
  } catch (e) { if (strict) throw e; return { settings: mergeSettings(null), source: "default" }; }
}
export const writeSettings = s => writeJson(SKEY, s);

export async function putImage(buf, contentType) {
  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  return put("img/p." + ext, buf, { access: "public", contentType, addRandomSuffix: true, cacheControlMaxAge: 31536000 });
}
// ملفات الطباعة (يرفعها الزبائن) — مجلد print/ منفصل ويتم تنظيفه دوريًا
export function putPrint(buf, contentType, base, ext) {
  return put("print/" + Date.now() + "-" + base + "." + ext, buf, { access: "public", contentType, addRandomSuffix: true, cacheControlMaxAge: 3600 });
}
export async function cleanPrintFiles(days) {
  const cutoff = Date.now() - days * 86400000; let cursor, deleted = 0;
  do {
    const r = await blobList({ prefix: "print/", cursor, limit: 1000 });
    const old = r.blobs.filter(b => new Date(b.uploadedAt).getTime() < cutoff);
    if (old.length) { await del(old.map(b => b.url)); deleted += old.length; }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return deleted;
}
export async function removeImages(urls) { const u = urls.filter(x => /^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(x)); if (u.length) await del(u); }
export function authOk(req) {
  const p = process.env.ADMIN_PASSWORD, h = String(req.headers["x-admin-password"] || "");
  if (!p) return false;
  const a = crypto.createHash("sha256").update(h).digest(), b = crypto.createHash("sha256").update(p).digest();
  return crypto.timingSafeEqual(a, b);
}
export const imgUrl = (base, k) => /^https?:\/\//.test(k) ? k : base + "/img/" + encodeURIComponent(k);
// أول دخول للوحة: نحفظ القوائم الأولية في Blob حتى لا نحتاج لعمليات list بعد ذلك
export async function ensureInit() {
  const l = await readList({ strict: true }); if (l.source === "seed") await writeList(l.list);
  const st = await readSettings({ strict: true }); if (st.source === "default") await writeSettings(st.settings);
}
