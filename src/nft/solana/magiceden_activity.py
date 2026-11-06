from .magiceden import me_get

def get_activity(symbol):
    return me_get(f"collections/{symbol}/activities")
