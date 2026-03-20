import { gunzipSync } from 'node:zlib';
import type { SampledEntry } from '@/lib/types';

export async function reservoirSampleFromRemoteGzip(url: string, k: number): Promise<SampledEntry[]> {
  if (!Number.isInteger(k) || k <= 0) {
    throw new Error('K must be a positive integer.');
  }

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'Accept-Encoding': 'gzip',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch train split: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const decompressed = gunzipSync(Buffer.from(arrayBuffer)).toString('utf-8');
  const lines = decompressed.split('\n').filter((line) => line.trim().length > 0);

  const reservoir: SampledEntry[] = [];
  lines.forEach((line, i) => {
    const parsed = JSON.parse(line) as SampledEntry;
    if (i < k) {
      reservoir.push(parsed);
      return;
    }
    const j = Math.floor(Math.random() * (i + 1));
    if (j < k) {
      reservoir[j] = parsed;
    }
  });

  return reservoir;
}
