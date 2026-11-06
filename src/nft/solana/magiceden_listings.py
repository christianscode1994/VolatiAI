from .magiceden import me_get

def get_listings(symbol):
    return me_get(f"collections/{symbol}/listings")
