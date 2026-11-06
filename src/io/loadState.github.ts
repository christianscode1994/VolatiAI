const RAW_BASE =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/inputs";

export async function loadStateFromGitHub() {
  async function load(name: string) {
    const res = await fetch(`${RAW_BASE}/${name}`);
    return res.json();
  }

  const latest = await load("latest.json");
  const flows = await load("sector_flows.json");
  const reliability = await load("reliability.json");

  return { latest, flows, reliability };
}
