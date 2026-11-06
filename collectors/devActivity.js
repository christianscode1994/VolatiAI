// collectors/devActivity.js

import axios from "axios";
import { randomDelay } from "../postingPatterns.js";
import { collectorConfig } from "../config.js";

export async function collectDevActivity(repo) {
  try {

    await randomDelay(300, 1200);

    const url =
      `https://api.github.com/repos/${repo}/commits?per_page=50`;

    const { data } = await axios.get(
      url,
      {
        headers: {
          "User-Agent": "VolatiAI-Swarm",
          "Accept": "application/vnd.github+json"
        }
      }
    );

    if (
      !Array.isArray(data) ||
      data.length === 0
    ) {

      return {
        metric: "developer",

        timestamp:
          new Date().toISOString(),

        score: 0,

        repo,

        commitCount: 0,

        label: "inactive",

        summary:
          `No commits found for ${repo}`
      };
    }

    const now = Date.now();

    const DAY =
      24 * 60 * 60 * 1000;

    const commitsLast24h =
      data.filter(commit => {

        const ts =
          commit?.commit?.author?.date;

        if (!ts) {
          return false;
        }

        return (
          now -
          new Date(ts).getTime()
          <= DAY
        );

      }).length;

    const threshold =
      Number(
        collectorConfig
          ?.dev_activity
          ?.threshold ?? 20
      );

    const score =
      commitsLast24h;

    const label =
      commitsLast24h > threshold
        ? "high"
        : "normal";

    const summary =
      commitsLast24h > threshold
        ? `Developer activity surge in ${repo}: ${commitsLast24h} commits`
        : `Developer activity normal in ${repo}`;

    return {
      metric: "developer",

      timestamp:
        new Date().toISOString(),

      score,

      repo,

      commitCount:
        commitsLast24h,

      threshold,

      label,

      summary,

      data: {
        repo,
        commitsLast24h,
        threshold
      },

      sources: {
        github: true
      }
    };

  } catch (err) {

    console.error(
      `DevActivity collector error for ${repo}:`,
      err?.message || err
    );

    return {
      metric: "developer",

      timestamp:
        new Date().toISOString(),

      score: 0,

      repo,

      commitCount: 0,

      label: "error",

      error:
        err?.message ||
        "Unknown GitHub error",

      sources: {
        github: true
      }
    };
  }
}
