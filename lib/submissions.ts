import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { SubmissionPayload } from '@/lib/types';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function saveSubmission(payload: SubmissionPayload) {
  const supabase = getSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase
      .from('submissions')
      .insert({
        dataset_name: payload.datasetName,
        task_name: payload.taskName,
        task_definition: payload.taskDefinition,
        payload,
      })
      .select('id, created_at')
      .single();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return { backend: 'supabase', ...data };
  }

  const devPath = path.join(process.cwd(), 'data', 'submissions.dev.jsonl');
  const record = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    dataset_name: payload.datasetName,
    task_name: payload.taskName,
    task_definition: payload.taskDefinition,
    payload,
  };
  await fs.appendFile(devPath, JSON.stringify(record) + '\n');
  return { backend: 'local-dev-file', id: record.id, created_at: record.created_at };
}
