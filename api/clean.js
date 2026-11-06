// تنظيف ملفات الطباعة القديمة: يعمل تلقائيًا مرة يوميًا (Vercel Cron) أو من لوحة التحكم
import { readSettings, cleanPrintFiles, authOk, hasBlob } from "../lib/store.js";
export default async function handler(req, res) {
  const ua = String(req.headers["user-agent"] || ""), bearer = String(req.headers.authorization || "");
  const cron = ua.startsWith("vercel-cron") || (process.env.CRON_SECRET && bearer === "Bearer " + process.env.CRON_SECRET);
  if (!cron && !authOk(req)) return res.status(401).json({ error: "غير مصرح." });
  if (!hasBlob()) return res.status(500).json({ error: "Blob غير موصول." });
  try { const days = (await readSettings({ strict: false })).settings.printKeepDays || 7; return res.json({ deleted: await cleanPrintFiles(days), days }); }
  catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
}
