import fs from "fs";

function safeRead(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function buildGeo() {
  const reliability = safeRead("public/reliability.json");
  if (!reliability || !Array.isArray(reliability.workers)) {
    fs.writeFileSync("public/geo.json", "[]");
    return;
  }

  const geo = reliability.workers.map(w => {
    // You can expand this mapping later
    const country = w.country || "Unknown";
    const region = w.region || "Unknown";

    return {
      url: w.url,
      sector: w.sector,
      country,
      region,
      latency_ms: w.latency_ms,
      reliability: w.reliability
    };
  });

  fs.writeFileSync("public/geo.json", JSON.stringify(geo, null, 2));
}

buildGeo();
