# AI Act Article 50 — Transparency Assessment

**Assessment date:** 2026-10-27
**Assessor:** Solo developer/operator, VolatiAI
**Regulatory basis:** Regulation (EU) 2024/1689, Article 50(1), (4)
**Applicability in Finland from:** 2 August 2026

## What Article 50 requires

Article 50(1) requires that providers of AI systems intended to interact directly
with natural persons ensure that the AI system is designed so that natural persons
are informed that they are interacting with an AI system, unless this is obvious
from the point of view of a reasonably well-informed, observant and circumspect
natural person, taking into account the circumstances and context of use.

Article 50(4) requires deployers of AI systems generating or manipulating text
published for the purpose of informing the public on matters of public interest
to disclose that the text has been artificially generated or manipulated. That
obligation does not apply where the AI-generated content has undergone human
review or editorial control and a natural or legal person holds editorial
responsibility for the publication.

## VolatiAI's system characteristics

- VolatiAI generates text (signal digests) from aggregated public data
- The output is published on public channels to inform the public
- The synthesis is automated; there is no per-post human editorial review
- The output is not personalized to any individual user

## Assessment of the "obviousness" exemption

The Commission's guidance is that "obvious" is to be read narrowly and with
respect to the specific audience and context. VolatiAI's output is formatted
as a structured data digest with trend indicators, not as conversational
prose. A reader could not reliably conclude from format alone that the text
was machine-generated.

**Conclusion:** The obviousness exemption is not relied on. Explicit
disclosure is the safer route and is what VolatiAI implements.

## Assessment of the "human review" exemption

Article 50(4)'s editorial-responsibility exemption would require documented
per-publication review by a person with relevant expertise who holds
editorial responsibility. VolatiAI's automated broadcast model does not
provide this level of review, and the exemption is therefore **not
claimed**.

**Conclusion:** VolatiAI relies on the Article 50(4) disclosure route, not
the editorial-responsibility exemption.

## Disclosure implemented

VolatiAI publishes the following disclosure in every automated post:

    🤖 Automated bot · AI-generated content · Non-commercial · Stateless

The disclosure is:

- Present on every post (not hidden in profile or terms)
- Present from the first interaction
- Plain language, not technical jargon
- Combined with identity disclosure (bot label) and content disclosure
  (AI-generated)

Additionally, bot self-labels are enabled on:

- Bluesky (self-label "bot")
- Mastodon (account `bot` flag)
- Telegram (BotFather account, "bot" in name)
- Discord (bot account)
- Slack (bot user)
- Nostr (profile description states automation)

## Ongoing obligations

The operator commits to:

- Keep the disclosure present in all future template changes
- Re-assess this document if the synthesis pipeline changes materially
- Re-assess if the system ever introduces interactive or conversational
  features (which would trigger additional Article 50 obligations)

## Limitations

This is the operator's own assessment. It reflects the operator's reading of
the publicly available regulatory text and guidance as of the assessment date.
A qualified legal professional should be consulted before any commercial use
or material change to the system.
