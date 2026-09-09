from fastapi import FastAPI
from core.uio import build_uio

app = FastAPI(title="VolatiAI API", version="1.0.0")


@app.get("/uio")
def get_uio():
    """
    Return the full Unified Intelligence Object.
    """
    return build_uio()


@app.get("/uio/{section}")
def get_uio_section(section: str):
    """
    Return a specific section of the UIO:
    developer, market, defi, nft, narratives, risk, agents, meta
    """
    uio = build_uio()
    key = section.lower()

    if key not in uio:
        return {"error": f"section '{section}' not found"}

    return {key: uio[key]}
