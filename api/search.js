export default async function handler(req, res) {
  try {
    const q = req.query.q;
    if (!q) {
      return res.status(400).json({ error: "query required" });
    }

    const url =
      "https://m.youtube.com/results?search_query=" +
      encodeURIComponent(q);

    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Linux; Android 12; Mobile Safari/537.36)",
        "accept-language": "en-US,en;q=0.9"
      }
    });

    const html = await response.text();

    // Block / consent detection (VERY important)
    if (
      html.includes("Before you continue to YouTube") ||
      html.includes("consent.youtube.com") ||
      html.includes("captcha")
    ) {
      return res.status(503).json({ error: "consent or blocked" });
    }

    // 1️⃣ Find ytInitialData
    const marker = "var ytInitialData =";
    const markerIndex = html.indexOf(marker);

    if (markerIndex === -1) {
      return res.status(500).json({
        error: "ytInitialData marker not found"
      });
    }

    // 2️⃣ Find JSON start
    const jsonStart = html.indexOf("{", markerIndex);
    if (jsonStart === -1) {
      return res.status(500).json({
        error: "ytInitialData JSON start not found"
      });
    }

    // 3️⃣ Brace-count JSON end
    let braceCount = 0;
    let i = jsonStart;

    for (; i < html.length; i++) {
      if (html[i] === "{") braceCount++;
      else if (html[i] === "}") braceCount--;

      if (braceCount === 0) {
        i++;
        break;
      }
    }

    const jsonString = html.slice(jsonStart, i);

    let data;
    try {
      data = JSON.parse(jsonString);
    } catch {
      return res.status(500).json({
        error: "ytInitialData JSON parse failed"
      });
    }

    // 4️⃣ Navigate EXACT path for search results
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
        error: "no video found in ytInitialData"
      });
    }

    res.setHeader(
      "Cache-Control",
      "s-maxage=600, stale-while-revalidate"
    );

    res.json({
      query: q,
      result: videoId
    });
  } catch (err) {
    res.status(500).json({ error: "internal error" });
  }
                                  }
