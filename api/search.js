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
          "Mozilla/5.0 (Linux; Android 11; Mobile Safari/537.36)",
        "accept-language": "en-US,en;q=0.9"
      }
    });

    if (!r.ok) {
      return res.status(500).json({ error: "fetch failed" });
    }

    const html = await r.text();

    // 1️⃣ Detect block / captcha / consent
    if (
      !html ||
      html.length < 1000 ||
      html.includes("captcha") ||
      html.includes("consent") ||
      html.includes("unusual traffic")
    ) {
      return res.status(503).json({ error: "blocked by youtube" });
    }

    // 2️⃣ Ensure ytInitialData exists
    if (!html.includes("ytInitialData")) {
      return res.status(500).json({
        error: "ytInitialData string missing"
      });
    }

    // 3️⃣ Robust extraction (handles all known formats)
    const match = html.match(
      /(?:var |window\["ytInitialData"\]|ytInitialData)\s*=\s*(\{[\s\S]*?\});/
    );

    if (!match || !match[1]) {
      return res.status(500).json({
        error: "ytInitialData regex failed"
      });
    }

    let data;
    try {
      data = JSON.parse(match[1]);
    } catch (e) {
      return res.status(500).json({
        error: "ytInitialData JSON parse failed"
      });
    }

    // 4️⃣ Traverse safely to find first videoId
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
        if (item?.videoRenderer?.videoId) {
          videoId = item.videoRenderer.videoId;
          break;
        }
      }
      if (videoId) break;
    }

    if (!videoId) {
      return res.status(404).json({
        error: "no video found"
      });
    }

    // 5️⃣ Cache to reduce blocks
    res.setHeader(
      "Cache-Control",
      "s-maxage=600, stale-while-revalidate"
    );

    res.json({
      query: q,
      result: videoId
    });
  } catch (err) {
    res.status(500).json({
      error: "internal error"
    });
  }
          }
