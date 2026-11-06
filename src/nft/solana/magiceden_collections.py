from .magiceden import me_get

def get_collection_stats(symbol):
    return me_get(f"collections/{symbol}/stats")
