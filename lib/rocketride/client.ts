// RocketRide client — invokes pipelines deployed to cloud.rocketride.ai.
//
// Every extract/judge/merge/brief pipeline is built locally in the
// RocketRide VS Code extension, deployed to the cloud, and called from
// this module. Never run pipelines locally in tasky itself.
//
// Pipeline IDs come from env vars populated after `rocketride deploy`.

interface RocketRideConfig {
  url: string
  apiKey: string
}

function config(): RocketRideConfig {
  const url = process.env.ROCKETRIDE_API_URL
  const apiKey = process.env.ROCKETRIDE_API_KEY
  if (!url || !apiKey) {
    throw new Error(
      'Missing RocketRide env vars: ROCKETRIDE_API_URL, ROCKETRIDE_API_KEY.',
    )
  }
  return { url, apiKey }
}

async function invokePipeline<TIn, TOut>(
  pipelineId: string,
  input: TIn,
): Promise<TOut> {
  const { url, apiKey } = config()
  const res = await fetch(`${url}/v1/pipelines/${pipelineId}/invoke`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`rocketride ${res.status} ${pipelineId}: ${body.slice(0, 300)}`)
  }
  const payload = (await res.json()) as { output: TOut; run_id: string }
  return payload.output
}

// ─── Pipeline invocations ─────────────────────────────────────

export interface ExtractInput {
  source: 'gmail' | 'granola'
  userEmail: string
  userId: string
  /** For gmail: thread payload. For granola: note payload. */
  payload: unknown
}

export interface ExtractOutput {
  candidates: Array<Record<string, unknown>>
  extract_call_id: string
}

export async function extract(input: ExtractInput): Promise<ExtractOutput> {
  const pipeline = process.env.ROCKETRIDE_PIPELINE_EXTRACT
  if (!pipeline) throw new Error('Missing ROCKETRIDE_PIPELINE_EXTRACT env var.')
  return invokePipeline<ExtractInput, ExtractOutput>(pipeline, input)
}

export interface JudgeInput {
  source: 'gmail' | 'granola'
  batchLabel: string
  sourceText: string
  candidates: Array<Record<string, unknown>>
  graphContext: Array<Record<string, unknown>>
  clearedContext: Array<Record<string, unknown>>
  userId: string
}

export interface JudgeOutput {
  decisions: Array<{
    idx: number
    verdict: 'keep' | 'drop' | 'merge' | 'subtask'
    reason: string
    merge_target_id?: string
    subtask_target_id?: string
    parent_idx?: number
    corrected_tag?: string
    corrected_urgent?: boolean
    corrected_draft_confidence?: string
  }>
  judge_call_id: string
}

export async function judge(input: JudgeInput): Promise<JudgeOutput> {
  const pipeline = process.env.ROCKETRIDE_PIPELINE_JUDGE
  if (pipeline) {
    return invokePipeline<JudgeInput, JudgeOutput>(pipeline, input)
  }
  // Local fallback — same prompt, same model, called directly through
  // Butterbase AI Gateway. Lets the judge work today without waiting on
  // a RocketRide VS Code deploy. Same output contract as the pipeline.
  const { ai } = await import('../butterbase/client')
  const {
    JUDGE_SYSTEM_PROMPT,
    buildJudgeUserPrompt,
    PROMPT_ID,
    PROMPT_VERSION,
  } = await import('../prompts/judge')
  const { extractJsonObject } = await import('../utils')

  const resp = await ai({
    system: JUDGE_SYSTEM_PROMPT,
    user: buildJudgeUserPrompt({
      source: input.source,
      batchLabel: input.batchLabel,
      sourceText: input.sourceText,
      candidates: input.candidates as any,
      graphContext: input.graphContext as any,
      clearedContext: input.clearedContext as any,
    }),
    prompt_id: PROMPT_ID,
    prompt_version: PROMPT_VERSION,
    user_id: input.userId,
    max_tokens: 3000,
  })

  const parsed = JSON.parse(extractJsonObject(resp.text)) as JudgeOutput
  return {
    decisions: parsed?.decisions ?? [],
    judge_call_id: resp.call_id,
  }
}

export interface GraphMergeInput {
  userEmail: string
  userId: string
  keptCandidates: Array<Record<string, unknown>>
  merges: Array<{ target_id: string; candidate: Record<string, unknown> }>
  subtasks: Array<{ target_id: string; candidate: Record<string, unknown> }>
}

export interface GraphMergeOutput {
  created_task_ids: string[]
  merged_count: number
  subtask_count: number
}

export async function graphMerge(input: GraphMergeInput): Promise<GraphMergeOutput> {
  const pipeline = process.env.ROCKETRIDE_PIPELINE_GRAPH_MERGE
  if (!pipeline) throw new Error('Missing ROCKETRIDE_PIPELINE_GRAPH_MERGE env var.')
  return invokePipeline<GraphMergeInput, GraphMergeOutput>(pipeline, input)
}

export interface BriefInput {
  taskId?: string
  meetingId?: string
  subgraph: Record<string, unknown>
}

export interface BriefOutput {
  why: string
  know: string[]
  done: string
  next: string
  talking_points?: string[]
}

export async function brief(input: BriefInput): Promise<BriefOutput> {
  const pipeline = process.env.ROCKETRIDE_PIPELINE_BRIEF
  if (!pipeline) throw new Error('Missing ROCKETRIDE_PIPELINE_BRIEF env var.')
  return invokePipeline<BriefInput, BriefOutput>(pipeline, input)
}
