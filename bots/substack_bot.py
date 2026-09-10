import os
import smtplib
from email.mime.text import MIMEText
from bots.bot_core import snapshot_intel

def run_substack_bot():
    snap = snapshot_intel()
    body = f"VolatiAI Snapshot {snap['timestamp']}\nScore: {snap['score']:.3f} ({snap['label']})"

    msg = MIMEText(body)
    msg["Subject"] = f"VolatiAI Snapshot {snap['timestamp']}"
    msg["From"] = os.getenv("SMTP_FROM")
    msg["To"] = os.getenv("SUBSTACK_EMAIL")

    with smtplib.SMTP(os.getenv("SMTP_SERVER"), 587) as s:
        s.starttls()
        s.login(os.getenv("SMTP_FROM"), os.getenv("SMTP_PASS"))
        s.send_message(msg)
