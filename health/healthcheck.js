export async function healthcheck() {

  return {

    timestamp:
      new Date().toISOString(),

    telegram:
      !!process.env.TELEGRAM_BOT_TOKEN,

    discord:
      !!process.env.DISCORD_WEBHOOK_URL,

    slack:
      !!process.env.SLACK_WEBHOOK_URL,

    bluesky:
      !!process.env.BLUESKY_HANDLE,

    mastodon:
      !!process.env.MASTODON_ACCESS_TOKEN,

    nostr:
      !!process.env.NOSTR_PRIVATE_KEY

  };

}
