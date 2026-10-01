// contentFormatter.js

function baseText(signal, score) {
  return `Severity: ${score}\nSummary: ${signal.summary}\nData: ${JSON.stringify(signal.data || {}, null, 2)}`;
}

export function formatForPlatform(platform, signal, score) {
  const text = baseText(signal, score);

  switch (platform) {
    case "mastodon":
      return `${text}\n\n#VolatiAI #DePIN #Signals`;
    case "bluesky":
      return `${signal.summary} (score: ${score})`;
    case "telegram":
      return `⚡ <b>VolatiAI Signal</b>\n<pre>${text}</pre>`;
    case "slack":
      return {
        text: "VolatiAI Signal",
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `*Severity:* ${score}` } },
          { type: "section", text: { type: "mrkdwn", text: `*Summary:* ${signal.summary}` } },
          { type: "section", text: { type: "mrkdwn", text: "```" + JSON.stringify(signal.data || {}, null, 2) + "```" } }
        ]
      };
    default:
      return text;
  }
}
