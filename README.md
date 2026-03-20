# FullSpectrumDataset Portal

A small Next.js portal for browsing FullSpectrumDataset tasks, reading task README files, sampling metadata examples from the train split, and submitting seed-instruction annotations.

## What this app does

- reads `data/tasks_list.csv`
- lets the user select **dataset -> task**
- fetches and displays `README.md` under the task path
- shows the configured target field
- samples `K` metadata entries from `train.jsonl.gz`
- submits:
  - task definition
  - sampled metadata entries
  - stage-1 QA pairs
  - stage-2 QA pairs
- stores submissions in Supabase
  - local development fallback: `data/submissions.dev.jsonl`

## Assumptions

This starter assumes your public dataset repo is:

- owner: `RayTzeng`
- repo: `FullSpectrumDataset`
- branch: `main`

and that each task folder contains:

- `README.md`
- `train.jsonl.gz`

For example, if `Task Path` is:

    FullSpectrumDataset/metadata/LibriSpeech/ASR

then the app will fetch:

    https://raw.githubusercontent.com/RayTzeng/FullSpectrumDataset/main/metadata/LibriSpeech/ASR/README.md
    https://raw.githubusercontent.com/RayTzeng/FullSpectrumDataset/main/metadata/LibriSpeech/ASR/train.jsonl.gz

If your actual file layout differs, adjust `lib/tasks.ts` or add more columns to `tasks_list.csv`.

## Project structure

    app/
      api/
        tasks/route.ts
        sample/route.ts
        submissions/route.ts
      globals.css
      layout.tsx
      page.tsx
    components/
      PortalApp.tsx
    data/
      tasks_list.csv
    lib/
      sample.ts
      submissions.ts
      tasks.ts
      types.ts
      validation.ts
    supabase/
      schema.sql

## Local setup

1. Clone this repo.
2. Copy `.env.example` to `.env.local`.
3. Fill in the environment variables.
4. Install dependencies.
5. Run the app.

    cp .env.example .env.local
    npm install
    npm run dev

Then open:

    http://localhost:3000

## Environment variables

    NEXT_PUBLIC_GITHUB_OWNER=RayTzeng
    NEXT_PUBLIC_GITHUB_REPO=FullSpectrumDataset
    SUPABASE_URL=...
    SUPABASE_SERVICE_ROLE_KEY=...

Notes:

- `NEXT_PUBLIC_GITHUB_OWNER` and `NEXT_PUBLIC_GITHUB_REPO` tell the app where to fetch `README.md` and `train.jsonl.gz`.
- `SUPABASE_SERVICE_ROLE_KEY` is used only on the server in `app/api/submissions/route.ts`.
- If Supabase variables are missing, the app falls back to appending submissions into `data/submissions.dev.jsonl` for local development.

## Supabase setup

Create a new Supabase project, then run the SQL in `supabase/schema.sql`.

The current schema stores the full submission payload in a JSONB column for flexibility.

## Vercel deployment

1. Push this repo to GitHub as `FullSpectrumDataset-portal`.
2. Go to Vercel and import the GitHub repo.
3. Set these environment variables in the Vercel project settings:

    NEXT_PUBLIC_GITHUB_OWNER=RayTzeng
    NEXT_PUBLIC_GITHUB_REPO=FullSpectrumDataset
    SUPABASE_URL=...
    SUPABASE_SERVICE_ROLE_KEY=...

4. Deploy.

### Important note for Vercel

This design intentionally fetches README and train metadata from GitHub at request time, so the portal does **not** need the full `FullSpectrumDataset` repo copied into the Vercel filesystem.

That makes deployment much simpler, but it also means:

- the dataset repo must stay publicly readable, or you must replace the GitHub fetch logic with authenticated fetching
- your `Task Path` values must correctly map to the actual folder layout
- sampling from very large `train.jsonl.gz` files may become slow; if that happens, precompute a sample pool per task instead of sampling the full train split each time

## Suggested improvements after MVP

- add authentication for annotators
- add submission history page
- add export to JSONL or CSV
- precompute sampling pools
- add separate columns in `tasks_list.csv` for explicit `README Path` and `Train Path`
- add server-side validation for minimum M and N question counts

