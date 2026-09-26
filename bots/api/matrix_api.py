import requests
import os

TOKEN = os.getenv("MATRIX_TOKEN")

def send_matrix(room_id: str, text: str):
    url = f"https://matrix.org/_matrix/client/r0/rooms/{room_id}/send/m.room.message"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    requests.post(url, headers=headers, json={"msgtype": "m.text", "body": text})
