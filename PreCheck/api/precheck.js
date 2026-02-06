import { kv } from "@vercel/kv";

const KEY = "precheck:state:v1";

function setNoStore(res) {
  res.setHeader("Cache-Control", "no-store");
}

export default async function handler(req, res) {
  setNoStore(res);

  if (req.method === "GET") {
    const data = (await kv.get(KEY)) || { updatedAt: null, items: {} };
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      const next = {
        updatedAt: new Date().toISOString(),
        items: body?.items && typeof body.items === "object" ? body.items : {}
      };

      await kv.set(KEY, next);
      return res.status(200).json({ ok: true, ...next });
    } catch (e) {
      return res.status(400).json({ ok: false, error: "Invalid JSON" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method Not Allowed" });
}
