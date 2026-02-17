function decodeHtmlEntities(str) {
  return str
    // numeric entities
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    )
    // named entities (minimum required)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'");
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

    // 🔒 consent / block detection
    if (
      html.includes("Before you continue to YouTube") ||
      html.includes("consent.youtube.com") ||
      html.includes("captcha")
    ) {
      return res.status(503).json({ error: "consent or blocked" });
    }

    // 1️⃣ find ytInitialData
    const key = "ytInitialData";
    const idx = html.indexOf(key);
    if (idx === -1) {
      return res.status(500).json({ error: "ytInitialData not found" });
    }

    // 2️⃣ find JSON start
    const start = html.indexOf("{", idx);
    if (start === -1) {
      return res.status(500).json({ error: "JSON start not found" });
    }

    // 3️⃣ brace counting
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

    let objectString = html.slice(start, end);

    // 🔑 CRITICAL STEP
    objectString = decodeHtmlEntities(objectString);

    // 4️⃣ evaluate as JS
    let data;
    try {
      data = Function('"use strict";return (' + objectString + ')')();
    } catch (e) {
      return res.status(500).json({
        error: "ytInitialData eval failed",
        note: "HTML is altered; this does NOT happen on real fetch()"
      });
    }

    // 5️⃣ extract first videoId
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
      return res.status(404).json({ error: "no video found" });
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
