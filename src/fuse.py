import json

def load(path):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def run():
    free = {
        "market": load("public/free_market.json"),
        "sentiment": load("public/free_sentiment.json"),
        "developer": load("public/free_developer.json")
    }

    pro = {
        "market": load("private/pro_market.json"),
        "sentiment": load("private/pro_sentiment.json"),
        "developer": load("private/pro_developer.json")
    }

    with open("public/free.json", "w") as f:
        json.dump(free, f, indent=2)
    with open("private/pro.json", "w") as f:
        json.dump(pro, f, indent=2)

if __name__ == "__main__":
    run()
