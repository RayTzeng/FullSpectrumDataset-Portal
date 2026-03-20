import { NextRequest, NextResponse } from 'next/server';
import { getTask, normalizeRepoRelativePath, buildRawGitHubUrl } from '@/lib/tasks';
import { reservoirSampleFromRemoteGzip } from '@/lib/sample';

export async function GET(request: NextRequest) {
  const datasetName = request.nextUrl.searchParams.get('datasetName');
  const taskName = request.nextUrl.searchParams.get('taskName');
  const kParam = request.nextUrl.searchParams.get('k') || '3';
  const k = Number(kParam);

  if (!datasetName || !taskName) {
    return NextResponse.json({ error: 'datasetName and taskName are required.' }, { status: 400 });
  }
  if (!Number.isInteger(k) || k <= 0 || k > 20) {
    return NextResponse.json({ error: 'k must be an integer between 1 and 20.' }, { status: 400 });
  }

  const task = await getTask(datasetName, taskName);
  if (!task) {
    return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
  }

  try {
    const relative = normalizeRepoRelativePath(task.taskPath);
    const trainUrl = buildRawGitHubUrl(`${relative}/train.jsonl.gz`);
    const samples = await reservoirSampleFromRemoteGzip(trainUrl, k);
    return NextResponse.json({ samples, trainUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sample entries.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
