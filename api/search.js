function maybeDecodeHtml(str) {
  // Only decode if HTML entities exist
  if (!str.includes("&#")) return str;

  return str
    .replace(/&#34;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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
          "Mozilla/5.0 (Linux; Android 13; Mobile Safari/537.36)",
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

    // Locate ytInitialData
    const marker = "ytInitialData";
    const idx = html.indexOf(marker);
    if (idx === -1) {
      return res.status(500).json({
        error: "ytInitialData not found"
      });
    }

    // Find first {
    const start = html.indexOf("{", idx);
    if (start === -1) {
      return res.status(500).json({
        error: "JSON start not found"
      });
    }

    // Brace counting
    let brace = 0;
    let end = start;

    for (; end < html.length; end++) {
      if (html[end] === "{") brace++;
      else if (html[end] === "}") brace--;
      if (brace === 0) {
        end++;
        break;
      }
    }

    let jsonString = html.slice(start, end);

    // 🔑 decode ONLY if escaped (sample file case)
    jsonString = maybeDecodeHtml(jsonString);

    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      return res.status(500).json({
        error: "ytInitialData JSON parse failed",
        hint: "HTML was altered before parsing"
      });
    }

    // Extract first videoId
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
