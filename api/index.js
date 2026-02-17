const axios = require('axios');

export default async function handler(req, res) {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Please provide a search term using ?q=' });
  }

  try {
    const response = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
      headers: {
        // THIS IS THE FIX: We send a cookie saying "We already consented"
        'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+419',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.150 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const html = response.data;

    // 1. Locate the start of the JSON data
    const startKey = 'var ytInitialData =';
    const startIndex = html.indexOf(startKey);

    if (startIndex === -1) {
      // If we can't find it, YouTube probably blocked the IP
      return res.status(500).json({ error: 'YouTube blocked this request. Try again later.' });
    }

    // 2. Extract the JSON string carefully
    // We look for the first semicolon after the start index to find the end
    let endIndex = html.indexOf(';</script>', startIndex);
    if (endIndex === -1) {
        // Fallback: sometimes it ends with just a semicolon and a newline
        endIndex = html.indexOf(';\n', startIndex);
    }
    
    // If we still can't find an end, take a safe guess length
    if (endIndex === -1) return res.status(500).json({ error: 'Failed to parse page structure.' });

    const jsonString = html.substring(startIndex + startKey.length, endIndex).trim();

    // 3. Parse the JSON
    const json = JSON.parse(jsonString);

    // 4. Dig through the JSON to find the first video
    const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    
    let firstVideo = null;

    if (contents) {
      for (const section of contents) {
        if (section.itemSectionRenderer?.contents) {
          for (const item of section.itemSectionRenderer.contents) {
            // We verify it is a video (not a channel, playlist, or ad)
            if (item.videoRenderer) {
              firstVideo = item.videoRenderer;
              break; 
            }
          }
        }
        if (firstVideo) break;
      }
    }

    // 5. Send Response
    if (firstVideo) {
      return res.status(200).json({
        top_result: {
          videoId: firstVideo.videoId,
          title: firstVideo.title?.runs?.[0]?.text,
          thumbnail: firstVideo.thumbnail?.thumbnails?.[0]?.url
        }
      });
    } else {
      return res.status(404).json({ error: 'No video found for this query' });
    }

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
      }
