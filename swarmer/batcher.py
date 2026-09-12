BATCH = []

def add_to_batch(event):
    BATCH.append(event)

def flush_batch():
    if not BATCH:
        return
    print({"batch": BATCH})
    BATCH.clear()
