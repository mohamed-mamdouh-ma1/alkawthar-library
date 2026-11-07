// يقدّم لوجو الموقع الحالي (المرفوع من لوحة التحكم) لمعاينة الروابط في واتساب
import { readSettings } from "../lib/store.js";
export default async function handler(req, res) {
  try {
    const { settings } = await readSettings({ strict: false });
    if (settings.logo) {
      const r = await fetch(settings.logo);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        res.setHeader("Content-Type", r.headers.get("content-type") || "image/png");
        res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
        return res.status(200).end(buf);
      }
    }
  } catch (e) {}
  res.statusCode = 302; res.setHeader("Location", "/img/logo.png"); res.setHeader("Cache-Control", "public, s-maxage=60");
  res.end();
}
