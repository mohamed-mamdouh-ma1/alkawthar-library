import { readSettings } from "../lib/store.js";
export default async function handler(req, res) {
  const { settings } = await readSettings({ strict: false });
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
  res.status(200).json({ settings });
}
