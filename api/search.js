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

    // block / consent detection
    if (
      html.includes("Before you continue to YouTube") ||
      html.includes("consent.youtube.com") ||
      html.includes("captcha")
    ) {
      return res.status(503).json({ error: "blocked or consent page" });
    }

    // 1️⃣ Locate ytInitialData assignment
    const key = "ytInitialData";
    const idx = html.indexOf(key);
    if (idx === -1) {
      return res.status(500).json({ error: "ytInitialData not found" });
    }

    // 2️⃣ Find first { after it
    const start = html.indexOf("{", idx);
    if (start === -1) {
      return res.status(500).json({ error: "JSON start not found" });
    }

    // 3️⃣ Brace-count to extract object
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

    // 4️⃣ Evaluate as JavaScript (NOT JSON)
    let data;
    try {
      data = Function("return " + objectString)();
    } catch (e) {
      return res.status(500).json({
        error: "ytInitialData eval failed",
        reason: "JS object, not strict JSON"
      });
    }

    // 5️⃣ Extract first videoId
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
  } catch (err) {
    res.status(500).json({ error: "internal error" });
  }
  }
