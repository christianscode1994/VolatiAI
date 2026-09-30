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
      return null; // no signal triggered
    }

    // --- Severity Escalation ---
    let severity = "info";

    if (commits >= threshold * 2.5) {
      severity = "critical";
    } else if (commits >= threshold * 1.5) {
      severity = "warning";
    } else {
      severity = "info";
    }

    return {
      type: "devActivity",
      severity,
      summary: `Developer activity spike: ${commits} commits in last 24h (threshold=${threshold}).`,
      data: { commits, threshold },
    };
  } catch (err) {
    console.log("DevActivity signal error:", err.message);
    return null;
  }
}
