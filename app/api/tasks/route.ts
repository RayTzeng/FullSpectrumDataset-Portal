import { NextResponse } from 'next/server';
import { loadTasks, normalizeRepoRelativePath, buildRawGitHubUrl, buildBlobGitHubUrl } from '@/lib/tasks';

export async function GET() {
  const tasks = await loadTasks();

  const enriched = tasks.map((task) => {
    const relative = normalizeRepoRelativePath(task.taskPath);
    return {
      ...task,
      readmeUrl: buildRawGitHubUrl(`${relative}/README.md`),
      trainUrl: buildRawGitHubUrl(`${relative}/train.jsonl.gz`),
      browserUrl: buildBlobGitHubUrl(relative),
    };
  });

  return NextResponse.json({ tasks: enriched });
}
