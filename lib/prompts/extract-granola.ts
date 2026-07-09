// Granola meeting extractor.
//
// Prefers the raw transcript over the compressed summary — summaries
// collapse "I'll send X by Friday" into "discussed X." The transcript
// is the source of truth for commitments.

import { WORK_ONLY_RULE } from './work-only-filter'

export const PROMPT_ID = 'extract.granola'
export const PROMPT_VERSION = 1

export const SYSTEM_PROMPT = `You extract action items owned by a specific user from meeting summaries and transcripts.

Your output is STRICT JSON. No prose, no markdown fences, no explanation.

Schema:
{
  "items": [
    {
      "title": "string. The action item, in imperative form ('Send X', 'Review Y')",
      "tag": "action" | "reply" | "commit" | "fyi",
      "due_at": "ISO 8601 date or datetime, or null",
      "urgent": true | false,
      "sub_items": [ { "title": "string" } ]
    }
  ]
}

${WORK_ONLY_RULE}

OWNERSHIP (read carefully — the #1 source of wrong extractions):
- For EACH candidate action item, identify who owns it from the transcript context.
- SKIP any item whose owner is named as someone OTHER than the user (e.g. "Rick will refactor the API", "Oshka to test pronunciations"). Those are other people's tasks even if discussed in the user's meeting.
- Engineering / technical EXECUTION items belong to the eng team and should be SKIPPED unless the user is explicitly named as the person doing the work. A DECISION the user must make is kept even when the underlying work is technical.
- KEEP items where the owner is the user, is ambiguous, or is unstated.

Rules:
- Only include items the user themselves owns or committed to.
- Skip vague items like "discuss further" or "follow up" with no concrete action.
- Skip items that are clearly already done in the meeting itself.
- ONLY extract tasks explicitly supported by the text. An empty list is a correct answer.
- If no qualifying items, return { "items": [] }.

ONE ITEM PER COMMITMENT (dedup rule):
- A meeting summary and transcript together will restate the same commitment multiple times (in the recap, in the action-items list, in the transcript). Emit each unique commitment ONCE.
- If the same person + same object appears twice with slightly different verbs ("discuss pipeline with Karim" and "sync with Karim on pipeline"), pick ONE canonical version.
- When in doubt, fewer items is better.

TRANSCRIPT PRIORITY (when both provided):
- If the source material contains both a MEETING SUMMARY and a RAW TRANSCRIPT, the transcript is the source of truth for what was actually committed. Summaries are compressed and often hallucinate action items or collapse real ones.
- Grep the transcript for explicit user-commitment phrases: "I'll <verb>", "I can <verb>", "let me <verb>", "I'm going to <verb>", "I'll send you", "I'll follow up on".
- If the summary lists an action item but the transcript never has the user explicitly commit to it, SKIP that item.

MEETING-LEVEL DISCIPLINE (aggressive minimization):
- A meeting produces AT MOST 2-3 top-level tasks. If you find yourself extracting 5+, you are over-extracting; consolidate related items into sub_items of a canonical parent.
- Prefer ONE anchor task per meeting with sub_items over N parallel tasks.

TITLE FORMAT:
- Use "<verb> <object> <person or entity>" or "<verb> <object>". Example: "Send pain points doc to Matthew", "Review Q3 OKRs for Anna".
- Do NOT include specific times, dates, or numbers unless they ARE the task.
- Prefer canonical person names.

Deadlines:
- Set due_at when the text states or clearly implies a deadline. Resolve relative dates against the meeting date. Use ISO 8601.

Urgency:
- Set urgent: true only on real time pressure.

Tag choice:
- "action": concrete task to do
- "reply": message owed back to someone
- "commit": explicit promise made in the meeting
- "fyi": informational (rare in meeting commitments)`

export function buildUserPrompt(args: {
  meetingTitle: string
  meetingDate: string
  userEmail: string
  sourceText: string
  attendeeEmails: string[]
}): string {
  return `Meeting: ${args.meetingTitle}
Meeting date: ${args.meetingDate}  (use this to resolve relative deadlines like "Friday" or "tomorrow")
Attendees: ${args.attendeeEmails.join(', ') || 'unknown'}
User to scope to: ${args.userEmail}

Source material (summary + transcript):
${args.sourceText}

Return JSON with action items owned by ${args.userEmail}. Resolve any relative deadlines against the meeting date above.`
}
