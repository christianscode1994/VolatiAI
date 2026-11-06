import json
import time
from flask import Flask, jsonify
from core.uio import build_uio

app = Flask(__name__)


def _timestamp():
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


@app.route("/")
def root():
    return jsonify({
        "status": "VolatiAI Dashboard Online",
        "timestamp": _timestamp(),
        "routes": [
            "/uio",
            "/uio/master",
            "/uio/developer",
            "/uio/market",
            "/uio/defi",
            "/uio/nft",
            "/uio/narrative",
            "/uio/risk",
            "/uio/agents"
        ]
    })


@app.route("/uio")
def full_uio():
    return jsonify(build_uio())


@app.route("/uio/<section>")
def uio_section(section):
    uio = build_uio()

    if section not in uio:
        return jsonify({"error": "Invalid section"}), 404

    return jsonify(uio[section])


def run_dashboard():
    print("VolatiAI Dashboard running at http://localhost:5000")
    app.run(host="0.0.0.0", port=5000)
