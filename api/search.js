function decodeHtml(str) {
  return str
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

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

    // consent / block detection
    if (
      html.includes("Before you continue to YouTube") ||
      html.includes("consent.youtube.com") ||
      html.includes("captcha")
    ) {
      return res.status(503).json({ error: "blocked or consent page" });
    }

    const marker = "var ytInitialData =";
    const markerIndex = html.indexOf(marker);

    if (markerIndex === -1) {
      return res.status(500).json({
        error: "ytInitialData marker not found"
      });
    }

    const jsonStart = html.indexOf("{", markerIndex);
    if (jsonStart === -1) {
      return res.status(500).json({
        error: "ytInitialData JSON start not found"
      });
    }

    // brace counting
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

    let jsonString = html.slice(jsonStart, i);

    // 🔑 CRITICAL FIX
    jsonString = decodeHtml(jsonString);

    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      return res.status(500).json({
        error: "ytInitialData JSON parse failed",
        reason: "HTML-escaped JSON"
      });
    }

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

    res.setHeader(
      "Cache-Control",
      "s-maxage=600, stale-while-revalidate"
    );

    res.json({
      query: q,
      result: videoId
    });
  } catch {
    res.status(500).json({ error: "internal error" });
  }
  }
