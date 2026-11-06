def card(label, value):
    return f"""
    <div class="card">
      <div class="label">{label}</div>
      <div class="score">{value}</div>
    </div>
    """

def grid(cards_html):
    return f"""
    <div class="grid">
      {cards_html}
    </div>
    """
