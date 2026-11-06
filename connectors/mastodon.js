export async function publish(message) {

  const server =
    process.env.MASTODON_SERVER;

  return fetch(
    `${server}/api/v1/statuses`,
    {
      method: "POST",
      headers: {
        "Authorization":
          `Bearer ${process.env.MASTODON_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: message
      })
    }
  );

}
