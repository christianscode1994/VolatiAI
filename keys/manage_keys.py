import json
import sys
from pathlib import Path

KEYS_PATH = Path(__file__).resolve().parent / "pro_keys.json"

def load_keys():
    if not KEYS_PATH.exists():
        return {}
    with open(KEYS_PATH, encoding="utf-8") as f:
        return json.load(f)

def save_keys(keys):
    with open(KEYS_PATH, "w", encoding="utf-8") as f:
        json.dump(keys, f, indent=2)

def add_key(user_id):
    keys = load_keys()
    keys[str(user_id)] = True
    save_keys(keys)
    print(f"Added Pro key for user {user_id}")

def remove_key(user_id):
    keys = load_keys()
    if str(user_id) in keys:
        del keys[str(user_id)]
        save_keys(keys)
        print(f"Removed Pro key for user {user_id}")
    else:
        print("User not found")

def list_keys():
    keys = load_keys()
    if not keys:
        print("No Pro keys.")
        return
    print("Pro keys:")
    for uid in keys:
        print(f"- {uid}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: manage_keys.py [add|remove|list] [user_id]")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "list":
        list_keys()
    elif cmd in ("add", "remove"):
        if len(sys.argv) < 3:
            print("User ID required.")
            sys.exit(1)
        user_id = sys.argv[2]
        if cmd == "add":
            add_key(user_id)
        else:
            remove_key(user_id)
    else:
        print("Unknown command.")
