import fs from "fs/promises";

export async function loadStateLocal() {
  const latest = JSON.parse(await fs.readFile("./data/inputs/latest.json", "utf8"));
  const flows = JSON.parse(await fs.readFile("./data/inputs/sector_flows.json", "utf8"));
  const reliability = JSON.parse(await fs.readFile("./data/inputs/reliability.json", "utf8"));
  return { latest, flows, reliability };
}
