# RocketRide pipelines for tasky

> **Status: aspirational.** These manifests are ready to deploy but no RocketRide account is currently wired. The shipping LLM path is Butterbase (see `lib/butterbase/client.ts`). When RocketRide access is sorted, drop these manifests into the dashboard, populate the env vars, and the client will take over. Until then, the sidebar Stack card intentionally does NOT list RocketRide — no dead links in the demo.

Every LLM call in the tasky pipeline can be executed one of two ways:

1. **RocketRide-hosted** (preferred for prod + evals) — pipelines live in `rocketride/pipelines/`, deployed to `cloud.rocketride.ai`, invoked via `POST /v1/pipelines/{id}/invoke`.
2. **Butterbase local fallback** — `lib/rocketride/client.ts::judge` and friends fall through to `lib/butterbase/client.ts` when the corresponding env var isn't set.

The fallback keeps the demo alive if a pipeline is unhealthy. RocketRide is the shipping path once the env vars are set on Vercel.

## Files

```
rocketride/
├── README.md                        ← this file
└── pipelines/
    ├── judge.pipeline.yaml          ← ROCKETRIDE_PIPELINE_JUDGE
    ├── extract-gmail.pipeline.yaml  ← ROCKETRIDE_PIPELINE_EXTRACT (source: gmail)
    ├── extract-granola.pipeline.yaml ← ROCKETRIDE_PIPELINE_EXTRACT (source: granola)
    ├── brief.pipeline.yaml          ← ROCKETRIDE_PIPELINE_BRIEF
    └── prompts/
        ├── judge.system.md
        ├── judge.user.hbs
        ├── extract-gmail.system.md
        ├── extract-gmail.user.hbs
        ├── extract-granola.system.md
        ├── extract-granola.user.hbs
        └── brief.system.md
```

Prompts are kept in sync with `lib/prompts/*.ts` so the local Butterbase fallback stays identical to the hosted pipeline. If you edit one, edit the other. `rocketride diff` will flag drift.

## First-time deploy

```bash
# 1. Log in to RocketRide from the CLI. Grab the API key from the
#    dashboard → Settings → API keys.
rocketride login

# 2. Point at your account.
rocketride use tasky

# 3. Validate every manifest before shipping.
rocketride validate rocketride/pipelines/*.pipeline.yaml

# 4. Deploy each pipeline. Each call returns a pipeline id (pl_...).
rocketride deploy rocketride/pipelines/judge.pipeline.yaml
rocketride deploy rocketride/pipelines/extract-gmail.pipeline.yaml
rocketride deploy rocketride/pipelines/extract-granola.pipeline.yaml
rocketride deploy rocketride/pipelines/brief.pipeline.yaml
```

Copy each `pl_...` id into `.env.local` and Vercel:

```
ROCKETRIDE_API_URL=https://cloud.rocketride.ai
ROCKETRIDE_API_KEY=rr_...
ROCKETRIDE_PIPELINE_JUDGE=pl_...
ROCKETRIDE_PIPELINE_EXTRACT=pl_...
ROCKETRIDE_PIPELINE_EXTRACT_GRANOLA=pl_...
ROCKETRIDE_PIPELINE_BRIEF=pl_...
```

> **Note:** the existing client only reads a single `ROCKETRIDE_PIPELINE_EXTRACT` env var. If you deploy separate gmail + granola pipelines (recommended — different prompts and schemas), the client will need a small extension to switch based on `source`. See "Follow-up work" below.

## Verify the deploy

Once env vars are set, hit the health-check endpoint:

```
curl -X POST https://tasky-liard-six.vercel.app/api/debug/rocketride
```

It fires a tiny synthetic call at each pipeline and reports pass / fail per lane. Expected output:

```json
{
  "ok": true,
  "judge":   { "ok": true,  "latency_ms": 812, "run_id": "run_..." },
  "extract_gmail":   { "ok": true, "latency_ms": 640, "run_id": "run_..." },
  "extract_granola": { "ok": true, "latency_ms": 690, "run_id": "run_..." },
  "brief":   { "ok": true,  "latency_ms": 730, "run_id": "run_..." }
}
```

## Redeploy after a prompt edit

```bash
rocketride deploy rocketride/pipelines/judge.pipeline.yaml --force
```

Version history stays in the RocketRide dashboard. You can `rocketride rollback pl_...@N` if a new version regresses.

## Follow-up work

- **Split `extract` into gmail + granola env vars** — `lib/rocketride/client.ts::extract` currently reads `ROCKETRIDE_PIPELINE_EXTRACT` and passes `source` inside the payload. Since the two pipelines have different prompts and different output schemas, extend the client to switch on `input.source` and read `ROCKETRIDE_PIPELINE_EXTRACT_GMAIL` / `ROCKETRIDE_PIPELINE_EXTRACT_GRANOLA`.
- **Wire the eval harness** — RocketRide has a built-in eval runner. Point it at `datasets/judge/*.jsonl` in the taskbash-audit skill for regression tests every 3 days.
- **Add prompt-diff CI** — a GitHub Action that runs `rocketride diff rocketride/pipelines/*.pipeline.yaml` on every PR touching `lib/prompts/` so local and hosted prompts can't silently drift.
