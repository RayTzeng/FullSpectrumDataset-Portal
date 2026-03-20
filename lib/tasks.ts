import fs from 'node:fs/promises';
import path from 'node:path';
import Papa from 'papaparse';
import type { TaskRow } from '@/lib/types';

const CSV_PATH = path.join(process.cwd(), 'data', 'tasks_list.csv');

export async function loadTasks(): Promise<TaskRow[]> {
  const csv = await fs.readFile(CSV_PATH, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  return parsed.data.map((row) => ({
    datasetName: row['Dataset Name']?.trim() ?? '',
    taskName: row['Task Name']?.trim() ?? '',
    taskPath: row['Task Path']?.trim() ?? '',
    targetField: row['Target field']?.replace(/^'+|'+$/g, '').trim() ?? '',
  }));
}

export async function getTask(datasetName: string, taskName: string): Promise<TaskRow | undefined> {
  const tasks = await loadTasks();
  return tasks.find((task) => task.datasetName === datasetName && task.taskName === taskName);
}

export function normalizeRepoRelativePath(taskPath: string): string {
  return taskPath.replace(/^FullSpectrumDataset\//, '').replace(/^\/+/, '');
}

export function getGitHubRepoConfig() {
  const owner = process.env.NEXT_PUBLIC_GITHUB_OWNER || 'RayTzeng';
  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO || 'FullSpectrumDataset';
  return { owner, repo };
}

export function buildRawGitHubUrl(repoRelativePath: string): string {
  const { owner, repo } = getGitHubRepoConfig();
  const encodedPath = repoRelativePath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/${encodedPath}`;
}

export function buildBlobGitHubUrl(repoRelativePath: string): string {
  const { owner, repo } = getGitHubRepoConfig();
  const encodedPath = repoRelativePath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `https://github.com/${owner}/${repo}/blob/main/${encodedPath}`;
}
