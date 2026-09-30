// signals/devActivity.js
import axios from "axios";

const DEV_ACTIVITY_API = process.env.DEV_ACTIVITY_API_URL;

export async function devActivitySignal() {
  if (!DEV_ACTIVITY_API) {
    console.log("DevActivity: no API configured.");
    return null;
  }

  try {
    const res = await axios.get(DEV_ACTIVITY_API);
    const data = res.data;

    // Expect commitsLast24h as integer
    const commits = Number(data.commitsLast24h ?? 0);
    const threshold = Number(process.env.DEV_ACTIVITY_THRESHOLD ?? 20);

    if (Number.isNaN(commits) || commits < threshold) {
      return null;
    }

    return {
      type: "devActivity",
      severity: commits > threshold * 2 ? "surge" : "elevated",
      summary: `Developer activity spike: ${commits} commits in last 24h.`,
      data: { commits },
    };
  } catch (err) {
    console.log("DevActivity signal error:", err.message);
    return null;
  }
}
