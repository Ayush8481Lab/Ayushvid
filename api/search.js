export default async function handler(req, res) {
  try {
    const q = req.query.q;
    if (!q) {
      return res.status(400).json({ error: "query required" });
    }

    const url =
      "https://m.youtube.com/results?search_query=" +
      encodeURIComponent(q);

    const r = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Linux; Android 10; Mobile)",
        "accept-language": "en-US,en;q=0.9"
      }
    });

    const html = await r.text();

    if (html.includes("captcha")) {
      return res.status(503).json({ error: "blocked" });
    }

    const match = html.match(
      /ytInitialData\s*=\s*(\{.*?\})\s*;/s
    );

    if (!match) {
      return res.status(500).json({ error: "ytInitialData not found" });
    }

    const data = JSON.parse(match[1]);

    const sections =
      data?.contents
        ?.twoColumnSearchResultsRenderer
        ?.primaryContents
        ?.sectionListRenderer
        ?.contents || [];

    let videoId = null;

    for (const section of sections) {
      const items =
        section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        if (item.videoRenderer?.videoId) {
          videoId = item.videoRenderer.videoId;
          break;
        }
      }
      if (videoId) break;
    }

    if (!videoId) {
      return res.status(404).json({ error: "no video found" });
    }

    res.setHeader("Cache-Control", "s-maxage=600");

    res.json({
      query: q,
      result: videoId
    });
  } catch (e) {
    res.status(500).json({ error: "internal error" });
  }
}
