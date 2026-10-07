import { BskyAgent } from "@atproto/api";

export async function publish(message) {

  const agent = new BskyAgent({
    service: "https://bsky.social"
  });

  await agent.login({
    identifier:
      process.env.BLUESKY_HANDLE,
    password:
      process.env.BLUESKY_PASSWORD
  });

  return agent.post({
    text: message
  });

}
