// صفحة مشاركة المنتج: تعرض صورة المنتج وعنوانه كمعاينة في واتساب، ثم تحوّل الزائر للكتالوج
import { readList, readSettings, imgUrl } from "../lib/store.js";
const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export default async function handler(req, res) {
  const code = String((req.query && req.query.code) || "").toUpperCase();
  const { list } = await readList({ strict: false });
  const { settings } = await readSettings({ strict: false }), CATS = settings.cats;
  const p = list.find(x => x.code === code);
  if (!p) { res.statusCode = 302; res.setHeader("Location", "/"); return res.end(); }
  const base = "https://" + (req.headers["x-forwarded-host"] || req.headers.host);
  const img = imgUrl(base, (p.images || [])[0] || "logo.png");
  const cl = (p.colors && p.colors.length ? p.colors : (p.color ? [p.color] : [])).join("، ");
  const price = p.salePrice != null ? p.salePrice + " ج.م (بدل " + p.price + ")" : p.price + " ج.م";
  const title = p.code + " | " + p.name, desc = [CATS[p.cat], cl, price].filter(Boolean).join(" · "), dest = "/#p/" + encodeURIComponent(p.code);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.end(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="product"><meta property="og:site_name" content="${esc(settings.title)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:url" content="${esc(base + "/p/" + p.code)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(dest)}"></head>
<body><script>location.replace(${JSON.stringify(dest)})</script><a href="${esc(dest)}">${esc(p.name)}</a></body></html>`);
}
