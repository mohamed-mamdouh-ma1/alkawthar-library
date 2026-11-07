import { catsOf, DEFAULTS, hasBlob, readList, writeList, readSettings, writeSettings, putImage, removeImages, ensureInit, cleanPrintFiles, authOk } from "../lib/store.js";

const s = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
function clean(p, keys) {
  const code = s(p.code, 20).toUpperCase();
  if (code && !/^[A-Z0-9\-_\u0600-\u06FF]+$/.test(code)) throw new Error("الكود يقبل حروفًا وأرقامًا وشرطة فقط.");
  if (!keys.includes(p.cat)) throw new Error("القسم غير صحيح.");
  const price = Math.round(Number(p.price) * 100) / 100;
  if (!s(p.name, 200)) throw new Error("اسم المنتج مطلوب.");
  if (!isFinite(price) || price < 0) throw new Error("السعر غير صحيح.");
  const images = (Array.isArray(p.images) ? p.images : []).slice(0, 6).map(x => s(x, 500)).filter(x => /^https:\/\/[^\s]+$/.test(x) || /^[\w\-.]+\.(jpg|jpeg|png|webp)$/i.test(x));
  if (!images.length) throw new Error("أضف صورة واحدة على الأقل.");
  const colors = (Array.isArray(p.colors) ? p.colors : (p.color ? [p.color] : [])).map(x => s(x, 30)).filter(Boolean).filter((x, i, r) => r.indexOf(x) === i).slice(0, 12);
  let dc = null; const d = p.discount;
  if (d && d.type) {
    const v = Number(d.value);
    if (!isFinite(v) || v <= 0 || (d.type === "percent" && v >= 100) || (d.type === "amount" && v >= price) || !["percent", "amount"].includes(d.type)) throw new Error("قيمة الخصم غير صحيحة.");
    dc = { type: d.type, value: v };
  }
  const o = { code, name: s(p.name, 200), cat: p.cat, price, colors, color: colors.join("، "), size: s(p.size, 60), tag: ["", "جديد", "الأكثر مبيعًا"].includes(p.tag) ? p.tag : "", images };
  if (dc) { o.discount = dc; o.salePrice = Math.round((dc.type === "percent" ? price * (1 - dc.value / 100) : price - dc.value) * 100) / 100; }
  if (s(p.desc, 2000)) o.desc = s(p.desc, 2000);
  const f = (Array.isArray(p.features) ? p.features : []).map(x => s(x, 200)).filter(Boolean).slice(0, 12);
  if (f.length) o.features = f;
  return o;
}
function cleanSettings(inp) {
  inp = inp || {};
  const url = v => { v = s(v, 500); return /^https?:\/\/\S+$/i.test(v) ? v : ""; };
  const digits = (v, min, max, d) => { const x = String(v == null ? "" : v).replace(/\D/g, ""); return x.length >= min && x.length <= max ? x : d; };
  const an = inp.announce || {}, seen = new Set(), categories = [];
  for (const c of catsOf(inp).slice(0, 12)) {
    const key = s(c.key, 20).toLowerCase(), name = s(c.name, 30);
    if (!/^[a-z][a-z0-9_-]{0,19}$/.test(key) || !name || seen.has(key)) continue;
    seen.add(key); categories.push({ key, name, prefix: s(c.prefix, 4).toUpperCase().replace(/[^A-Z0-9]/g, "") || "XX" });
  }
  if (!categories.length) throw new Error("لازم يبقى فيه قسم واحد على الأقل.");
  const cats = Object.fromEntries(categories.map(c => [c.key, c.name]));
  return {
    title: s(inp.title, 80) || DEFAULTS.title, subtitle: s(inp.subtitle, 160),
    logo: url(inp.logo), accent: /^#[0-9a-fA-F]{6}$/.test(String(inp.accent || "")) ? inp.accent : "#111111",
    wa: digits(inp.wa, 8, 15, DEFAULTS.wa), phone: digits(inp.phone, 0, 15, ""), phone2: digits(inp.phone2, 0, 15, ""),
    printEnabled: inp.printEnabled !== false, printInfo: s(inp.printInfo, 600), printKeepDays: Math.min(60, Math.max(1, parseInt(inp.printKeepDays, 10) || 7)), addr: s(inp.addr, 200),
    fb: url(inp.fb), ig: url(inp.ig), tg: url(inp.tg),
    announce: { on: !!an.on && !!s(an.text, 200), text: s(an.text, 200), link: url(an.link) },
    categories, cats, showBest: inp.showBest !== false, showNew: inp.showNew !== false,
    branches: (Array.isArray(inp.branches) ? inp.branches : []).slice(0, 30).map(b => ({ name: s(b.name, 80), addr: s(b.addr, 200), phone: digits(b.phone, 0, 15, ""), map: url(b.map) })).filter(b => b.name)
  };
}
function kind(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "طريقة غير مسموحة" });
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: "لم يتم ضبط ADMIN_PASSWORD في إعدادات Vercel." });
  if (!authOk(req)) return res.status(401).json({ error: "كلمة المرور غير صحيحة." });
  const b = req.body || {};
  try {
    if (b.action === "login") { if (hasBlob()) { try { await ensureInit(); } catch (e) {} } return res.json({ ok: true, blob: hasBlob() }); }
    if (!hasBlob()) return res.status(500).json({ error: "مخزن الصور (Blob) غير موصول بالمشروع." });
    if (b.action === "list") { const r = await readList({ strict: true }); return res.json({ products: r.list, source: r.source }); }
    if (b.action === "upload") {
      const buf = Buffer.from(String(b.data || ""), "base64");
      if (!buf.length || buf.length > 3 * 1024 * 1024) throw new Error("حجم الصورة غير مناسب.");
      const ct = kind(buf);
      if (!ct) throw new Error("نوع الصورة غير مدعوم.");
      const r = await putImage(buf, ct);
      return res.json({ url: r.url });
    }
    if (b.action === "save") {
      const { settings: cur } = await readSettings({ strict: true }), p = clean(b.product || {}, cur.categories.map(c => c.key)), { list } = await readList({ strict: true });
      const key = x => x.id || x.code, oldKey = b.oldId || b.oldCode;
      const old = oldKey ? list.findIndex(x => key(x) === oldKey) : -1;
      if (p.code && list.some((x, i) => x.code === p.code && i !== old)) throw new Error("الكود مستخدم بالفعل لمنتج آخر.");
      p.id = old >= 0 ? key(list[old]) : ((p.code && !list.some(x => key(x) === p.code)) ? p.code : "P" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase());
      const before = old >= 0 ? list[old] : null;
      if (old >= 0) list[old] = p; else list.push(p);
      await writeList(list);
      if (before) { const used = new Set(list.flatMap(x => x.images)); try { await removeImages(before.images.filter(x => !p.images.includes(x) && !used.has(x))); } catch (e) {} }
      return res.json({ products: list });
    }
    if (b.action === "delete") {
      const { list } = await readList({ strict: true }), i = list.findIndex(x => (x.id || x.code) === (b.id || b.code));
      if (i < 0) throw new Error("المنتج غير موجود.");
      const [gone] = list.splice(i, 1), used = new Set(list.flatMap(x => x.images));
      await writeList(list);
      try { await removeImages(gone.images.filter(x => !used.has(x))); } catch (e) {}
      return res.json({ products: list });
    }
    if (b.action === "cleanPrint") { const days = (await readSettings({ strict: true })).settings.printKeepDays || 7; return res.json({ deleted: await cleanPrintFiles(days), days }); }
    if (b.action === "getSettings") { const r = await readSettings({ strict: true }); return res.json({ settings: r.settings, source: r.source }); }
    if (b.action === "saveSettings") {
      const st = cleanSettings(b.settings), { list } = await readList({ strict: true }), keys = new Set(st.categories.map(c => c.key)), used = {};
      list.forEach(p => { if (!keys.has(p.cat)) used[p.cat] = (used[p.cat] || 0) + 1; });
      const bad = Object.keys(used);
      if (bad.length) {
        const old = (await readSettings({ strict: true })).settings, nm = k => (old.categories.find(c => c.key === k) || {}).name || k;
        throw new Error("لا يمكن حذف قسم فيه منتجات: " + bad.map(k => "«" + nm(k) + "» (" + used[k] + " منتج)").join("، ") + ". انقل منتجاته لقسم آخر أو احذفها أولًا.");
      }
      await writeSettings(st); return res.json({ settings: st });
    }
    return res.status(400).json({ error: "طلب غير معروف." });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
}
