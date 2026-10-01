// collectors/devActivity.js
import axios from "axios";
import { randomDelay } from "../postingPatterns.js";
import { collectorConfig } from "../config.js";

// --------------------------------------
//  DEV ACTIVITY COLLECTOR (CONFIG‑DRIVEN)
// --------------------------------------
//
// Uses GitHub API with lightweight "commits in last 24h" logic.
// This avoids heavy endpoints and reduces rate‑limit pressure.
//

export async function collectDevActivity(repo) {
  try {
    // Anti‑detection jitter before API call
    await randomDelay(300, 1200);

    const url = `https://api.github.com/repos/${repo}/commits?per_page=50`;
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "VolatiAI-Swarm",
        "Accept": "application/vnd.github+json"
      }
    });

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`DevActivity: no commits found for ${repo}`);
      return null;
    }

    // Count commits in last 24 hours
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const commitsLast24h = data.filter(commit => {
      const ts = commit.commit?.author?.date;
      if (!ts) return false;
      return now - new Date(ts).getTime() <= DAY;
    }).length;

    const threshold = Number(collectorConfig.dev_activity.threshold ?? 20);

    const summary =
      commitsLast24h > threshold
        ? `Developer activity surge in ${repo}: ${commitsLast24h} commits`
        : `Developer activity normal in ${repo}`;

    return {
      type: "dev",
      summary,
      data: {
        repo,
        commitsLast24h,
        threshold
      },
      volatility: 0,
      sentiment: 0,
      devActivity: commitsLast24h,
      depth: 0
    };
  } catch (err) {
    console.log(`DevActivity collector error for ${repo}:`, err.message);
    return null;
  }
}
