// POST /api/debug/rocketride
//
// Health check for the deployed RocketRide pipelines. Fires one tiny
// synthetic input at each of judge / extract-gmail / extract-granola /
// brief and reports pass or fail per lane. Use after `rocketride deploy`
// to confirm the env vars point at the right pipelines and the schemas
// on both sides agree.

import { NextResponse } from 'next/server'
import { judge, extract, brief } from '@/lib/rocketride/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function timed<T>(fn: () => Promise<T>): Promise<{
  ok: boolean
  latency_ms: number
  run_id?: string
  error?: string
  sample?: unknown
}> {
  const started = Date.now()
  try {
    const out = (await fn()) as any
    return {
      ok: true,
      latency_ms: Date.now() - started,
      run_id: out?.judge_call_id ?? out?.extract_call_id ?? undefined,
      sample: out,
    }
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function POST() {
  const userId = 'health-check'
  const userEmail = process.env.APP_USER_EMAIL ?? 'you@example.com'

  // If RocketRide isn't configured, report it as intentional up-front
  // rather than firing four requests that will all throw. Aspirational
  // by design — see lib/rocketride/client.ts header comment.
  const anyConfigured =
    !!process.env.ROCKETRIDE_API_URL &&
    !!process.env.ROCKETRIDE_API_KEY &&
    (!!process.env.ROCKETRIDE_PIPELINE_JUDGE ||
      !!process.env.ROCKETRIDE_PIPELINE_EXTRACT_GMAIL ||
      !!process.env.ROCKETRIDE_PIPELINE_EXTRACT_GRANOLA ||
      !!process.env.ROCKETRIDE_PIPELINE_BRIEF)
  if (!anyConfigured) {
    return NextResponse.json({
      ok: true,
      status: 'not_configured',
      message:
        'RocketRide is aspirational — no ROCKETRIDE_* env vars set. ' +
        'The judge is running on Butterbase locally. Wire ' +
        'ROCKETRIDE_API_URL + ROCKETRIDE_API_KEY + pipeline ids when ready.',
    })
  }

  const judgeCheck = timed(() =>
    judge({
      source: 'gmail',
      batchLabel: 'health-check',
      sourceText: 'Health check thread. No real content.',
      candidates: [
        {
          idx: 0,
          title: 'Send report to Anna',
          subtitle: 'Anna asked for the Q3 report by Friday.',
          tag: 'action',
          urgent: false,
          due_at: null,
          draft_confidence: null,
          sub_items: [],
        },
      ],
      graphContext: [],
      clearedContext: [],
      userId,
    }),
  )

  const extractGmailCheck = timed(() =>
    extract({
      source: 'gmail',
      userEmail,
      userId,
      payload: {
        threadId: 'health-check-thread',
        subject: 'Health check',
        messages: [
          {
            from: 'anna@example.com',
            to: userEmail,
            date: new Date().toISOString(),
            body: 'Hey, can you send me the Q3 report by Friday? Thanks.',
          },
        ],
      },
    }),
  )

  const extractGranolaCheck = timed(() =>
    extract({
      source: 'granola',
      userEmail,
      userId,
      payload: {
        meetingId: 'health-check-meeting',
        title: 'Health check meeting',
        startedAt: new Date().toISOString(),
        attendees: [
          { name: 'Anna', email: 'anna@example.com' },
          { name: 'You', email: userEmail },
        ],
        transcript: "You: I'll send Anna the Q3 report by Friday.",
        summary: 'Discussed Q3 report timing.',
      },
    }),
  )

  const briefCheck = timed(() =>
    brief({
      taskId: 'health-check-task',
      subgraph: {
        task: { id: 'health-check-task', title: 'Send Q3 report to Anna' },
        people: [{ email: 'anna@example.com', name: 'Anna' }],
        projects: [],
        recent_activity: [],
      },
    }),
  )

  const [j, eg, egr, b] = await Promise.all([
    judgeCheck,
    extractGmailCheck,
    extractGranolaCheck,
    briefCheck,
  ])

  const anyFail = !j.ok || !eg.ok || !egr.ok || !b.ok
  return NextResponse.json(
    {
      ok: !anyFail,
      env: {
        ROCKETRIDE_API_URL: !!process.env.ROCKETRIDE_API_URL,
        ROCKETRIDE_API_KEY: !!process.env.ROCKETRIDE_API_KEY,
        ROCKETRIDE_PIPELINE_JUDGE: !!process.env.ROCKETRIDE_PIPELINE_JUDGE,
        ROCKETRIDE_PIPELINE_EXTRACT_GMAIL:
          !!process.env.ROCKETRIDE_PIPELINE_EXTRACT_GMAIL,
        ROCKETRIDE_PIPELINE_EXTRACT_GRANOLA:
          !!process.env.ROCKETRIDE_PIPELINE_EXTRACT_GRANOLA,
        ROCKETRIDE_PIPELINE_EXTRACT_LEGACY:
          !!process.env.ROCKETRIDE_PIPELINE_EXTRACT,
        ROCKETRIDE_PIPELINE_BRIEF: !!process.env.ROCKETRIDE_PIPELINE_BRIEF,
      },
      judge: j,
      extract_gmail: eg,
      extract_granola: egr,
      brief: b,
    },
    { status: anyFail ? 502 : 200 },
  )
}
