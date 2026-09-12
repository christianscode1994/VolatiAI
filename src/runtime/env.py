import os

def detect_platform():
    if "CF_PAGES" in os.environ or "CLOUDFLARE_WORKERS" in os.environ:
        return "cloudflare"
    if "VERCEL" in os.environ:
        return "vercel"
    if "FLY_APP_NAME" in os.environ:
        return "fly"
    return "local"
