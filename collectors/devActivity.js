// collectors/devActivity.js
import axios from "axios";

export async function collectDevActivity(repo) {
  try {
    const url = `https://api.github.com/repos/${repo}/commits`;
    const { data } = await axios.get(url);

    const devActivity = data.length;

    return {
      type: "dev",
      summary: `Developer activity spike in ${repo}`,
      data: { commits: devActivity },
      volatility: 0,
      sentiment: 0,
      devActivity,
      depth: 0
    };
  } catch (err) {
    console.log("Dev activity collector error:", err.message);
    return null;
  }
}
