import fs from "fs";

function safeRead(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// Simple region mapping (expand later)
const REGION_MAP = {
  US: "North America",
  CA: "North America",
  MX: "North America",
  BR: "South America",
  AR: "South America",
  CL: "South America",
  FI: "Europe",
  SE: "Europe",
  NO: "Europe",
  DE: "Europe",
  FR: "Europe",
  GB: "Europe",
  CN: "Asia",
  JP: "Asia",
  KR: "Asia",
  IN: "Asia",
  AU: "Oceania",
  NZ: "Oceania"
};

// Example lat/lon mapping (you can expand this)
const GEO_COORDS = {
  US: { lat: 37.7749, lon: -122.4194 },
  FI: { lat: 60.1699, lon: 24.9384 },
  SE: { lat: 59.3293, lon: 18.0686 },
  DE: { lat: 52.5200, lon: 13.4050 },
  FR: { lat: 48.8566, lon: 2.3522 },
  GB: { lat: 51.5074, lon: -0.1278 },
  CN: { lat: 39.9042, lon: 116.4074 },
  JP: { lat: 35.6895, lon: 139.6917 },
  KR: { lat: 37.5665, lon: 126.9780 },
  IN: { lat: 28.6139, lon: 77.2090 },
  AU: { lat: -33.8688, lon: 151.2093 },
  NZ: { lat: -36.8485, lon: 174.7633 }
};

function buildGeo() {
  const reliability = safeRead("public/reliability.json");
  if (!reliability || !Array.isArray(reliability.workers)) {
    fs.writeFileSync("public/geo.json", "[]");
    return;
  }

  const geo = reliability.workers.map(w => {
    const country = w.country || "Unknown";
    const region = REGION_MAP[country] || "Unknown";

    const coords = GEO_COORDS[country] || { lat: 0, lon: 0 };

    return {
      url: w.url,
      sector: w.sector,
      country,
      region,
      lat: coords.lat,
      lon: coords.lon,
      latency_ms: w.latency_ms,
      reliability: w.reliability
    };
  });

  fs.writeFileSync("public/geo.json", JSON.stringify(geo, null, 2));
}

buildGeo();
