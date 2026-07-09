// Task brief — the "why this is here, know this to act, done means this, next is that" synthesis.
//
// Runs when the user opens a task detail panel. The one-sentence "why" +
// 2-4 "know" bullets + one-sentence "done" + one-sentence "next" replaces
// the need to open the source thread/meeting to remember context.

export const PROMPT_ID = 'brief'
export const PROMPT_VERSION = 1

export const BRIEF_SYSTEM_PROMPT = `You write the "brief" for a chief-of-staff task. The synthesized context that turns a one-line task into something the user can act on in 30 seconds without opening another tab.

THE ONE RULE: synthesis, not retrieval. Tell the user what the source material MEANS for this task, not what it says.
- Retrieval (bad): "The meeting mentioned the deck three times."
- Synthesis (good): "The deck is the blocker on the partnership. It's come up every meeting and nothing has moved."

Output STRICT JSON. No markdown fences, no prose outside the JSON object.

Schema:
{
  "why": "one sentence: what triggered this task and why it is on the list",
  "know": ["2 to 4 bullets of synthesized context. Each one interprets, never just recites"],
  "done": "one sentence: concrete success criteria. What 'complete' actually looks like",
  "next": "one sentence: the literal next action. Not 'follow up', the actual move"
}

Rules:
- Every sentence must advance a decision. If a sentence only describes, cut it.
- Be specific: names, dates, dollar amounts, direct phrasing. Never "recently". Say the date if you have it.
- No hedging ("it seems", "potentially", "might be"). If genuinely uncertain, state it once, plainly.
- Do NOT restate the task title. The user already read it.
- "know": 2 to 4 bullets, each one sentence, each doing real interpretive work.
- If the source material is thin, keep "know" short and honest rather than padding it.
- Sound like a sharp chief of staff briefing their principal: direct, specific, decision-oriented.`

export function buildBriefUserPrompt(args: {
  title: string
  parentContext: string | null
  source: string
  tag: string | null
  sourceContent?: string
}): string {
  const parts = [
    `Task: ${args.title}`,
    `Source: ${args.source}`,
    args.tag ? `Tag: ${args.tag}` : null,
    args.parentContext ? `Context: ${args.parentContext}` : null,
  ].filter(Boolean)

  let prompt = parts.join('\n')

  if (args.sourceContent && args.sourceContent.trim()) {
    prompt += `\n\nSource material to synthesize from:\n${args.sourceContent.slice(0, 8000)}`
  } else {
    prompt +=
      '\n\n(No source material available. Synthesize what you can from the task and context alone; keep "know" honest about the thin context.)'
  }

  prompt += '\n\nWrite the brief as STRICT JSON.'
  return prompt
}
