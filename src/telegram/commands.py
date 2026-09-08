import json
from .bot import send_message

def handle_command(cmd):
    if cmd == "/pro":
        send_message(
            "🔐 *VolatiAI Pro*\n"
            "Full intelligence layer activated:\n"
            "• Trend Acceleration\n"
            "• Narrative Timeline\n"
            "• Whale Pressure\n"
            "• Spoofing Probability\n"
            "• RPC Truth Score"
        )

    elif cmd == "/trend":
        accel = json.load(open("private/trends_accel.json"))
        send_message(
            "📈 *Trend Acceleration*\n"
            f"Volatility: {accel['volatility_accel']:+.2f}\n"
            f"Sentiment: {accel['sentiment_accel']:+.2f}\n"
            f"Developer Activity: {accel['dsi_accel']:+.2f}"
        )

    elif cmd == "/narratives":
        hist = json.load(open("private/narratives_timeline.json"))
        curr = hist[-1]
        send_message(
            "🤖 *AI/DePIN Narratives*\n"
            f"AI Keywords: {curr['ai_count']}\n"
            f"DePIN Keywords: {curr['depin_count']}"
        )

    elif cmd == "/depth":
        micro = json.load(open("private/microstructure.json"))
        send_message(
            "📡 *Depth & Microstructure*\n"
            f"Whale Orders: {len(micro['whale_orders'])}\n"
            f"Spoofing Probability: {micro['spoofing_score']:.1f}%"
        )

    elif cmd == "/truth":
        truth = json.load(open("private/rpc_truth.json"))
        send_message(
            "🔍 *RPC Truth Score*\n"
            f"Truth Score: {truth['truth_score']}%"
        )

    else:
        send_message(
            "❓ *Unknown command*\n"
            "Try:\n"
            "/pro\n"
            "/trend\n"
            "/narratives\n"
            "/depth\n"
            "/truth"
        )
