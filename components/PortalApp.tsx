'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { QAItem, SampledEntry, SeedInstructionItem, TaskRow } from '@/lib/types';

type TaskApiRow = TaskRow & {
  readmeUrl: string;
  trainUrl: string;
  browserUrl: string;
};

const [qaTextByEntry, setQaTextByEntry] = useState<
  { stage1: string; stage2: string }[]
>([]);

function qaItemsToJsonl(items: QAItem[]): string {
  return items
    .filter((item) => item.question.trim() || item.answer.trim())
    .map((item) => JSON.stringify({
      question: item.question,
      answer: item.answer,
    }))
    .join('\n');
}

function parseQaJsonl(text: string): QAItem[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, idx) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`Line ${idx + 1} is not valid JSON.`);
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('question' in parsed) ||
      !('answer' in parsed) ||
      typeof (parsed as { question: unknown }).question !== 'string' ||
      typeof (parsed as { answer: unknown }).answer !== 'string'
    ) {
      throw new Error(`Line ${idx + 1} must contain string fields "question" and "answer".`);
    }

    return {
      question: (parsed as { question: string }).question,
      answer: (parsed as { answer: string }).answer,
    };
  });
}

function emptyQA(): QAItem {
  return { question: '', answer: '' };
}

function buildSeedEntry(metadata: SampledEntry): SeedInstructionItem {
  return {
    metadata,
    stage1_QA: [emptyQA()],
    stage2_QA: [emptyQA()],
  };
}

export default function PortalApp() {
  const [tasks, setTasks] = useState<TaskApiRow[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [datasetName, setDatasetName] = useState('');
  const [taskName, setTaskName] = useState('');
  const [readme, setReadme] = useState('');
  const [readmeStatus, setReadmeStatus] = useState<string>('');
  const [k, setK] = useState(2);
  const [samples, setSamples] = useState<SampledEntry[]>([]);
  const [samplingState, setSamplingState] = useState<string>('');
  const [taskDefinition, setTaskDefinition] = useState('');
  const [seedInstructions, setSeedInstructions] = useState<SeedInstructionItem[]>([]);
  const [submitState, setSubmitState] = useState<string>('');

  useEffect(() => {
    async function load() {
      setLoadingTasks(true);
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data.tasks ?? []);
      setLoadingTasks(false);
    }
    load();
  }, []);

  const datasetOptions = useMemo(() => {
    return [...new Set(tasks.map((task) => task.datasetName))];
  }, [tasks]);

  const taskOptions = useMemo(() => {
    return tasks.filter((task) => task.datasetName === datasetName);
  }, [tasks, datasetName]);

  const selectedTask = useMemo(() => {
    return tasks.find((task) => task.datasetName === datasetName && task.taskName === taskName) ?? null;
  }, [tasks, datasetName, taskName]);

  useEffect(() => {
    if (!datasetName && datasetOptions.length > 0) {
      setDatasetName(datasetOptions[0]);
    }
  }, [datasetName, datasetOptions]);

  useEffect(() => {
    if (taskOptions.length > 0 && !taskOptions.some((task) => task.taskName === taskName)) {
      setTaskName(taskOptions[0].taskName);
    }
  }, [taskOptions, taskName]);

  useEffect(() => {
    async function loadReadme() {
      if (!selectedTask) return;
      setReadmeStatus('Loading README...');
      setReadme('');
      try {
        const res = await fetch(selectedTask.readmeUrl, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`README fetch failed: ${res.status}`);
        }
        const text = await res.text();
        setReadme(text);
        setReadmeStatus('');
      } catch (error) {
        setReadmeStatus(error instanceof Error ? error.message : 'Failed to load README.');
      }
    }
    loadReadme();
    setSamples([]);
    setSeedInstructions([]);
    setTaskDefinition('');
    setSubmitState('');
  }, [selectedTask]);

  async function handleSample() {
    if (!selectedTask) return;
    setSamplingState('Sampling examples...');
    setSubmitState('');
    try {
      const params = new URLSearchParams({
        datasetName: selectedTask.datasetName,
        taskName: selectedTask.taskName,
        k: String(k),
      });
      const res = await fetch(`/api/sample?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Sampling failed.');
      }
      setSamples(data.samples ?? []);
      const built = (data.samples ?? []).map(buildSeedEntry);
      setSeedInstructions(built);
      setQaTextByEntry([]);
      setSamplingState(`Loaded ${data.samples?.length ?? 0} sample(s).`);
    } catch (error) {
      setSamplingState(error instanceof Error ? error.message : 'Sampling failed.');
    }
  }

  async function handleSubmit() {
    if (!selectedTask) return;
    setSubmitState('Submitting...');
    try {
      const payload = {
        datasetName: selectedTask.datasetName,
        taskName: selectedTask.taskName,
        taskDefinition,
        seedInstructions,
      };
      try {
        qaTextByEntry.forEach((entry) => {
          parseQaJsonl(entry.stage1);
          parseQaJsonl(entry.stage2);
        });
      } catch (error) {
        setSubmitState(error instanceof Error ? error.message : 'Invalid QA JSONL.');
        return;
      }
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Submission failed.');
      }
      setSubmitState(`Submitted successfully. Backend: ${data.saved.backend}. Submission ID: ${data.saved.id}`);
    } catch (error) {
      setSubmitState(error instanceof Error ? error.message : 'Submission failed.');
    }
  }

  const canSubmit =
    Boolean(selectedTask && taskDefinition.trim() && seedInstructions.length > 0) &&
    seedInstructions.every(
      (entry) => entry.stage1_QA.length > 0 && entry.stage2_QA.length > 0
    );

  return (
    <div className="page">
      <div className="header">
        <h1>FullSpectrumDataset Portal</h1>
        <p>Browse task documentation, sample metadata entries from the train split, and submit seed instructions.</p>
      </div>

      <div className="grid">
        <div className="stack">
          <div className="card stack">
            <div>
              <label className="label">Dataset</label>
              <select value={datasetName} onChange={(e) => setDatasetName(e.target.value)} disabled={loadingTasks}>
                {datasetOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Task</label>
              <select value={taskName} onChange={(e) => setTaskName(e.target.value)} disabled={loadingTasks || !datasetName}>
                {taskOptions.map((task) => (
                  <option key={`${task.datasetName}-${task.taskName}`} value={task.taskName}>{task.taskName}</option>
                ))}
              </select>
            </div>

            {selectedTask && (
              <div className="notice">
                <div><strong>Target field:</strong> <span className="code-like">{selectedTask.targetField}</span></div>
                <div className="small" style={{ marginTop: 8 }}>
                  Task path: <span className="code-like">{selectedTask.taskPath}</span>
                </div>
                <div className="small" style={{ marginTop: 8 }}>
                  <a href={selectedTask.browserUrl} target="_blank" rel="noreferrer">Open task folder on GitHub</a>
                </div>
              </div>
            )}
          </div>

          <div className="card stack">
            <div className="row">
              <div style={{ flex: 1 }}>
                <label className="label">K sampled entries</label>
                <input type="number" min={1} max={20} value={k} onChange={(e) => setK(Number(e.target.value))} />
              </div>
              <div style={{ alignSelf: 'end' }}>
                <button onClick={handleSample} disabled={!selectedTask}>Sample train split</button>
              </div>
            </div>
            {samplingState && <div className="notice">{samplingState}</div>}
            <div className="small">The API samples from <span className="code-like">train.jsonl.gz</span> under the selected task path.</div>
          </div>

          <div className="card stack">
            <label className="label">Task definition</label>
            <textarea
              value={taskDefinition}
              onChange={(e) => setTaskDefinition(e.target.value)}
              placeholder="Write the task definition or annotation guideline to store with this submission."
            />
            <button onClick={handleSubmit} disabled={!canSubmit}>Submit</button>
            {submitState && (
              <div className={`notice ${submitState.startsWith('Submitted') ? 'success' : submitState === 'Submitting...' ? '' : 'error'}`}>
                {submitState}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: '0 0 8px 0' }}>README</h2>
                {selectedTask && (
                  <div className="row wrap">
                    <span className="badge">{selectedTask.datasetName}</span>
                    <span className="badge">{selectedTask.taskName}</span>
                    <span className="badge">target: {selectedTask.targetField}</span>
                  </div>
                )}
              </div>
            </div>
            {readmeStatus ? (
              <div className="notice">{readmeStatus}</div>
            ) : (
              <div className="markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                >
                  {readme}
                </ReactMarkdown>
              </div>
            )}
          </div>

          <div className="card stack">
            <h2 style={{ margin: 0 }}>Seed instruction editor</h2>
            {!samples.length && <div className="notice">Sample entries first to populate this section.</div>}

            {seedInstructions.map((entry, entryIndex) => (
              <div className="entry-card stack" key={entryIndex}>
                <div className="row wrap" style={{ justifyContent: 'space-between' }}>
                  <strong>Sample #{entryIndex + 1}</strong>
                  <span className="badge">metadata entry</span>
                </div>
                <pre>{JSON.stringify(entry.metadata, null, 2)}</pre>

                <div className="qa-block stack">
                  <div className="row wrap" style={{ justifyContent: 'space-between' }}>
                    <strong>Stage-1 questions</strong>
                    <span className="small">One JSON object per line</span>
                  </div>
                  <textarea
                    className="jsonl-editor"
                    value={qaTextByEntry[entryIndex]?.stage1 ?? ''}
                    onChange={(e) => updateQaText(entryIndex, 'stage1', e.target.value)}
                    placeholder={`{"question": "Is the speaker in their twenties?", "answer": "Yes."}
                {"question": "Identify the speaker's age group.", "answer": "twenties"}`}
                  />
                </div>

                <div className="qa-block stack">
                  <div className="row wrap" style={{ justifyContent: 'space-between' }}>
                    <strong>Stage-2 questions</strong>
                    <span className="small">One JSON object per line</span>
                  </div>
                  <textarea
                    className="jsonl-editor"
                    value={qaTextByEntry[entryIndex]?.stage2 ?? ''}
                    onChange={(e) => updateQaText(entryIndex, 'stage2', e.target.value)}
                    placeholder={`{"question": "Would young adult be a fair description?", "answer": "Yes."}
                {"question": "Translate this age estimate into a rough numeric interval.", "answer": "20-29"}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
