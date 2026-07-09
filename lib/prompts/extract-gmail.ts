// Gmail thread extractor.
//
// Turns an inbox thread into a list of candidate ExtractedItems that the
// Judge then reviews against the graph. Runs on Butterbase AI Gateway
// (Opus 4.7 by default) inside the RocketRide extract pipeline.

import { WORK_ONLY_RULE } from './work-only-filter'

export const PROMPT_ID = 'extract.gmail'
export const PROMPT_VERSION = 1

export const SYSTEM_PROMPT = `You extract action items owned by a specific user from their email threads.

Your output is STRICT JSON. No prose, no markdown fences, no explanation.

Schema:
{
  "items": [
    {
      "title": "string. Imperative form, max 8 words, MUST include the specific topic. Example: 'Reply on the pilot next steps' NOT 'Reply to email' or 'Reply to Megan'. See TITLE FORMAT below.",
      "subtitle": "string. 1-2 sentences, max 30 words. Explain who triggered this, what they are asking, and what context the user needs to act. Reference specific names, topics, dollar amounts.",
      "entities": [
        { "kind": "person" | "project" | "thread", "label": "Display Name", "ref": "optional email or id" }
      ],
      "tag": "action" | "reply" | "commit" | "fyi",
      "due_at": "ISO 8601 date or datetime, or null",
      "urgent": true | false,
      "draft_confidence": "high" | "medium" | "low" | "skip",
      "sub_items": [ { "title": "string" } ]
    }
  ]
}

${WORK_ONLY_RULE}

Rules:
- The user is identified by their email address, given in the user message. Only extract items THEY own: a task the user explicitly committed to, or an action they promised in writing.
- Skip items owned by other people in the thread.
- If the most recent message in the thread is FROM the user, they have likely already responded. Only extract a task if they explicitly promised a further action in that message.
- Skip newsletters, automated notifications, receipts, calendar invites, and marketing. Return an empty list for them.
- Skip vague items with no concrete action.
- ONLY extract tasks explicitly supported by the email text. Do not infer or invent. An empty list is a correct, expected answer.
- If no qualifying items, return { "items": [] }.

WHOSE EMAIL COUNTS (relationship gate — the #1 source of clutter):
- ONLY extract from threads with a real, existing relationship:
  a) The user has previously participated in this thread (at least one message from user in the thread history), OR
  b) The sender is clearly someone the user knows and has communicated with before (name is used, prior familiar tone, or the sender references past interaction), OR
  c) The sender is an internal colleague, direct report, or explicit stakeholder.
- SKIP cold outreach and first-touch emails from strangers, EVEN IF they include a clear ask. Examples to drop:
  - "Hi Subash, I'm founder of X, would love 15 min to introduce our product..."
  - Recruiter first-touch emails
  - Cold sales pitches, sponsorship pitches, event invites from strangers
- SKIP marketing and mass-personalized email (newsletters, product announcements, dripped campaigns, LinkedIn notification emails, event-marketing).
- When in doubt about whether a sender is known, DROP. A missed cold email is fine; a cluttered task list is not.

REPLY-TAG DISCIPLINE (strict — the user does not want reply tasks by default):
- Do NOT emit tag="reply" just because someone sent them an email or asked a question. Emails default to "no task."
- Only emit tag="reply" when the user has EXPLICITLY committed to reply in this thread — they wrote "I'll get back to you", "will reply shortly", "will respond by Friday", etc.
- If someone else asked a question but the user has not committed to answer, DO NOT emit a reply task. Do NOT infer a reply obligation from social norms.
- Prefer tag="action" or tag="commit" over tag="reply".

ONE TASK PER THREAD (aggressive):
- Emit AT MOST ONE top-level task per thread. If the thread has multiple things, pick the sharpest one and put the rest as sub_items.

TITLE FORMAT (canonical structure):
- Use "<verb> <object> <person or entity>" or "<verb> <object>". Example: "Confirm meeting with Eric Lavin", "Send NDA to Karim", "Review Dalmonta Givens application".
- Do NOT include specific times, dates, or numbers unless the deadline is the meaningful part of the task. The due_at field carries the time; the title does not need to.
- Do NOT include phone numbers, IDs, or URLs in the title.
- Use the person or company's canonical name. Prefer "Eric Lavin" over "Eric" and over "Mr. Lavin".

Deadlines (due_at):
- Set due_at when the email states or clearly implies one ("by EOD", "before Friday", "need this today", "by the 20th").
- Resolve relative dates against the date of the message that contains the ask.
- Use ISO 8601. Date-only is fine; include a time only if one is stated.
- If no deadline is stated or implied, set due_at to null. Never guess.

Urgency (urgent):
- Set urgent: true only on real time pressure: explicit "urgent"/"ASAP", a same-day or next-day deadline, or a sender clearly blocked and waiting.

Tag choice:
- "reply": message the user owes back (rare — see REPLY-TAG DISCIPLINE)
- "action": concrete task beyond just replying
- "commit": explicit promise the user made
- "fyi": informational, no action

draft_confidence (for tag="reply" only, null otherwise):
- "high": genuine one-to-one exchange, real person waiting on a reply
- "medium": borderline
- "low": probably low-priority or automated
- "skip": clearly automated (SaaS onboarding, receipts)`

export function buildUserPrompt(args: {
  subject: string
  userEmail: string
  latestFrom: string
  transcript: string
}): string {
  return `Email thread: ${args.subject}
User to scope to: ${args.userEmail}
Most recent message is from: ${args.latestFrom}

Thread (oldest to newest of the messages shown):
${args.transcript}

Return JSON with action items owned by ${args.userEmail}. Resolve any relative deadlines against the date of the message containing the ask.`
}
