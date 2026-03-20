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

function qaItemsToJsonl(items: QAItem[]): string {
  return items
    .filter((item) => item.question.trim() || item.answer.trim())
    .map((item) =>
      JSON.stringify({
        question: item.question,
        answer: item.answer,
      })
    )
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
      throw new Error(
        `Line ${idx + 1} must contain string fields "question" and "answer".`
      );
    }

    return {
      question: (parsed as { question: string }).question,
      answer: (parsed as { answer: string }).answer,
    };
  });
}

function formatJsonForEditor(value: SampledEntry): string {
  return JSON.stringify(value, null, 2);
}

function parseMetadataJson(text: string): SampledEntry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Metadata JSON is not valid.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Metadata must be a JSON object.');
  }

  return parsed as SampledEntry;
}

export default function PortalApp() {
  const [tasks, setTasks] = useState<TaskApiRow[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  const [datasetName, setDatasetName] = useState('');
  const [taskName, setTaskName] = useState('');

  const [readme, setReadme] = useState('');
  const [readmeStatus, setReadmeStatus] = useState('');

  const [k, setK] = useState(2);
  const [samples, setSamples] = useState<SampledEntry[]>([]);
  const [samplingState, setSamplingState] = useState('');

  const [taskDefinition, setTaskDefinition] = useState('');
  const [seedInstructions, setSeedInstructions] = useState<SeedInstructionItem[]>([]);
  const [qaTextByEntry, setQaTextByEntry] = useState<
    { stage1: string; stage2: string }[]
  >([]);
  const [metadataTextByEntry, setMetadataTextByEntry] = useState<string[]>([]);
  const [metadataEditByEntry, setMetadataEditByEntry] = useState<boolean[]>([]);
  const [submitState, setSubmitState] = useState('');
  const [resamplingIndex, setResamplingIndex] = useState<number | null>(null);

  useEffect(() => {
    async function loadTasks() {
      setLoadingTasks(true);
      try {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        setTasks(data.tasks ?? []);
      } catch {
        setTasks([]);
      } finally {
        setLoadingTasks(false);
      }
    }

    loadTasks();
  }, []);

  const datasetOptions = useMemo(() => {
    return [...new Set(tasks.map((task) => task.datasetName))];
  }, [tasks]);

  const taskOptions = useMemo(() => {
    return tasks.filter((task) => task.datasetName === datasetName);
  }, [tasks, datasetName]);

  const selectedTask = useMemo(() => {
    return (
      tasks.find(
        (task) => task.datasetName === datasetName && task.taskName === taskName
      ) ?? null
    );
  }, [tasks, datasetName, taskName]);

  useEffect(() => {
    if (!datasetName && datasetOptions.length > 0) {
      setDatasetName(datasetOptions[0]);
    }
  }, [datasetName, datasetOptions]);

  useEffect(() => {
    if (taskOptions.length > 0 && !taskOptions.some((t) => t.taskName === taskName)) {
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
        setReadmeStatus(
          error instanceof Error ? error.message : 'Failed to load README.'
        );
      }
    }

    loadReadme();

    setSamples([]);
    setSeedInstructions([]);
    setQaTextByEntry([]);
    setMetadataTextByEntry([]);
    setMetadataEditByEntry([]);
    setTaskDefinition('');
    setSamplingState('');
    setSubmitState('');
    setResamplingIndex(null);
  }, [selectedTask]);

  function updateQaText(
    entryIndex: number,
    stage: 'stage1' | 'stage2',
    value: string
  ) {
    setQaTextByEntry((current) => {
      const next = structuredClone(current);
      if (!next[entryIndex]) {
        next[entryIndex] = { stage1: '', stage2: '' };
      }
      next[entryIndex][stage] = value;
      return next;
    });

    try {
      const parsed = parseQaJsonl(value);
      setSeedInstructions((current) => {
        const next = structuredClone(current);
        if (!next[entryIndex]) return current;

        if (stage === 'stage1') {
          next[entryIndex].stage1_QA = parsed;
        } else {
          next[entryIndex].stage2_QA = parsed;
        }
        return next;
      });
      setSubmitState('');
    } catch {
      // Keep editor text as-is; strict validation happens on submit / finish.
    }
  }

  function updateMetadataText(entryIndex: number, value: string) {
    setMetadataTextByEntry((current) => {
      const next = structuredClone(current);
      next[entryIndex] = value;
      return next;
    });
  }

  function toggleMetadataEdit(entryIndex: number) {
    if (!metadataEditByEntry[entryIndex]) {
      setMetadataEditByEntry((current) => {
        const next = structuredClone(current);
        next[entryIndex] = true;
        return next;
      });
      return;
    }

    try {
      const parsed = parseMetadataJson(metadataTextByEntry[entryIndex] ?? '');
      setSamples((current) => {
        const next = structuredClone(current);
        next[entryIndex] = parsed;
        return next;
      });
      setSeedInstructions((current) => {
        const next = structuredClone(current);
        if (!next[entryIndex]) return current;
        next[entryIndex].metadata = parsed;
        return next;
      });
      setMetadataTextByEntry((current) => {
        const next = structuredClone(current);
        next[entryIndex] = formatJsonForEditor(parsed);
        return next;
      });
      setMetadataEditByEntry((current) => {
        const next = structuredClone(current);
        next[entryIndex] = false;
        return next;
      });
      setSubmitState('');
    } catch (error) {
      setSubmitState(
        error instanceof Error ? `Sample #${entryIndex + 1}: ${error.message}` : 'Invalid metadata JSON.'
      );
    }
  }

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

      const sampled: SampledEntry[] = data.samples ?? [];
      const built = sampled.map(buildSeedEntry);

      setSamples(sampled);
      setSeedInstructions(built);
      setQaTextByEntry(
        built.map((entry) => ({
          stage1: qaItemsToJsonl(entry.stage1_QA),
          stage2: qaItemsToJsonl(entry.stage2_QA),
        }))
      );
      setMetadataTextByEntry(sampled.map((entry) => formatJsonForEditor(entry)));
      setMetadataEditByEntry(sampled.map(() => false));
      setSamplingState(`Loaded ${sampled.length} sample(s).`);
    } catch (error) {
      setSamplingState(
        error instanceof Error ? error.message : 'Sampling failed.'
      );
    }
  }

  async function handleResampleEntry(entryIndex: number) {
    if (!selectedTask) return;

    setResamplingIndex(entryIndex);
    setSubmitState('');

    try {
      const params = new URLSearchParams({
        datasetName: selectedTask.datasetName,
        taskName: selectedTask.taskName,
        k: '1',
      });

      const res = await fetch(`/api/sample?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Resampling failed.');
      }

      const replacement = data.samples?.[0];
      if (!replacement) {
        throw new Error('No replacement sample returned.');
      }

      setSamples((current) => {
        const next = structuredClone(current);
        next[entryIndex] = replacement;
        return next;
      });

      setSeedInstructions((current) => {
        const next = structuredClone(current);
        next[entryIndex] = buildSeedEntry(replacement);
        return next;
      });

      setQaTextByEntry((current) => {
        const next = structuredClone(current);
        next[entryIndex] = { stage1: '', stage2: '' };
        return next;
      });

      setMetadataTextByEntry((current) => {
        const next = structuredClone(current);
        next[entryIndex] = formatJsonForEditor(replacement);
        return next;
      });

      setMetadataEditByEntry((current) => {
        const next = structuredClone(current);
        next[entryIndex] = false;
        return next;
      });
    } catch (error) {
      setSubmitState(
        error instanceof Error ? error.message : 'Resampling failed.'
      );
    } finally {
      setResamplingIndex(null);
    }
  }

  async function handleSubmit() {
    if (!selectedTask) return;

    setSubmitState('Submitting...');

    try {
      const parsedSeedInstructions = seedInstructions.map((entry, entryIndex) => {
        const rawQa = qaTextByEntry[entryIndex] ?? { stage1: '', stage2: '' };
        const rawMetadata = metadataTextByEntry[entryIndex] ?? '';

        const metadata = parseMetadataJson(rawMetadata);
        const stage1_QA = parseQaJsonl(rawQa.stage1);
        const stage2_QA = parseQaJsonl(rawQa.stage2);

        if (stage1_QA.length === 0) {
          throw new Error(`Sample #${entryIndex + 1}: stage-1 QA cannot be empty.`);
        }

        if (stage2_QA.length === 0) {
          throw new Error(`Sample #${entryIndex + 1}: stage-2 QA cannot be empty.`);
        }

        return {
          metadata,
          stage1_QA,
          stage2_QA,
        };
      });

      if (!taskDefinition.trim()) {
        throw new Error('Task definition cannot be empty.');
      }

      const payload = {
        datasetName: selectedTask.datasetName,
        taskName: selectedTask.taskName,
        taskDefinition,
        seedInstructions: parsedSeedInstructions,
      };

      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Submission failed.');
      }

      setSeedInstructions(parsedSeedInstructions);
      setMetadataTextByEntry(parsedSeedInstructions.map((entry) => formatJsonForEditor(entry.metadata)));
      setSubmitState(
        `Submitted successfully. Backend: ${data.saved.backend}. Submission ID: ${data.saved.id}`
      );
    } catch (error) {
      setSubmitState(
        error instanceof Error ? error.message : 'Submission failed.'
      );
    }
  }

  const canSubmit =
    Boolean(selectedTask && taskDefinition.trim() && seedInstructions.length > 0) &&
    qaTextByEntry.length === seedInstructions.length &&
    metadataTextByEntry.length === seedInstructions.length &&
    !metadataEditByEntry.some(Boolean);

  return (
    <div className="page">
      <div className="header">
        <h1>FullSpectrumDataset Portal</h1>
        <p>
          Browse task documentation, sample metadata entries from the train split,
          and submit seed instructions.
        </p>
      </div>

      <div className="grid">
        <div className="stack">
          <div className="card stack">
            <h2 style={{ margin: 0 }}>Reference materials</h2>
            <div className="notice">
              <div>
                <strong>Guide Sheet:</strong>{" "}
                <a
                  href="https://hackmd.io/@E6Umx55CRC2KGVCvqHvKHg/ByG1m9g9-e"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-block",
                    padding: "6px 12px",
                    backgroundColor: "#2563eb",
                    color: "white",
                    textDecoration: "none",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Open
                </a>
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Example process:</strong>{" "}
                <a
                  href="https://chatgpt.com/share/69bb5e82-d2f8-8001-af73-9a17a626095a"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-block",
                    padding: "6px 12px",
                    backgroundColor: "#2563eb",
                    color: "white",
                    textDecoration: "none",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Open
                </a>
              </div>
            </div>
          </div>

          <div className="card stack">
            <div>
              <label className="label">Dataset</label>
              <select
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                disabled={loadingTasks}
              >
                {datasetOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Task</label>
              <select
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                disabled={loadingTasks || !datasetName}
              >
                {taskOptions.map((task) => (
                  <option
                    key={`${task.datasetName}-${task.taskName}`}
                    value={task.taskName}
                  >
                    {task.taskName}
                  </option>
                ))}
              </select>
            </div>

            {selectedTask && (
              <div className="notice">
                <div>
                  <strong>Target field:</strong>{' '}
                  <span className="code-like">{selectedTask.targetField}</span>
                </div>
                <div className="small" style={{ marginTop: 8 }}>
                  Task path:{' '}
                  <span className="code-like">{selectedTask.taskPath}</span>
                </div>
                <div className="small" style={{ marginTop: 8 }}>
                  <a
                    href={selectedTask.browserUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open task folder on GitHub
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="card stack">
            <div className="row">
              <div style={{ flex: 1 }}>
                <label className="label">K sampled entries</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={k}
                  onChange={(e) => setK(Number(e.target.value))}
                />
              </div>
              <div style={{ alignSelf: 'end' }}>
                <button onClick={handleSample} disabled={!selectedTask}>
                  Sample train split
                </button>
              </div>
            </div>

            {samplingState && <div className="notice">{samplingState}</div>}

            <div className="small">
              The API samples from <span className="code-like">train.jsonl.gz</span>{' '}
              under the selected task path.
            </div>
          </div>

          <div className="card stack">
            <strong>Notes</strong>
            <ol style={{ margin: '0 0 0 20px', padding: 0 }}>
              <li>
                Please refer to the guide sheet and example process before writing
                seed instructions.
              </li>
              <li>
                If a particular question type does not suit the task, it is fine to
                omit it. Use your judgment.
              </li>
              <li>
                Make sure the sampled seed instructions are sufficiently diverse in
                wording and form.
              </li>
              <li>
                Enter the seed instructions as line-separated JSON objects, each
                containing a <span className="code-like">question</span> and an{' '}
                <span className="code-like">answer</span> for the corresponding
                metadata entry.
              </li>
              <li>
                Also submit a task definition that formally defines the purpose or
                goal of the task in one to three sentences.
              </li>
            </ol>
          </div>

          <div className="card stack">
            <label className="label">Task definition</label>
            <textarea
              value={taskDefinition}
              onChange={(e) => setTaskDefinition(e.target.value)}
              placeholder="Formally define the purpose or goal of this task in 1–3 sentences."
            />
            <button onClick={handleSubmit} disabled={!canSubmit}>
              Submit
            </button>
            {submitState && (
              <div
                className={`notice ${
                  submitState.startsWith('Submitted')
                    ? 'success'
                    : submitState === 'Submitting...'
                    ? ''
                    : 'error'
                }`}
              >
                {submitState}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div
              className="row wrap"
              style={{ justifyContent: 'space-between' }}
            >
              <div>
                <h2 style={{ margin: '0 0 8px 0' }}>README</h2>
                {selectedTask && (
                  <div className="row wrap">
                    <span className="badge">{selectedTask.datasetName}</span>
                    <span className="badge">{selectedTask.taskName}</span>
                    <span className="badge">
                      target: {selectedTask.targetField}
                    </span>
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

            {!samples.length && (
              <div className="notice">
                Sample entries first to populate this section.
              </div>
            )}

            {seedInstructions.map((entry, entryIndex) => (
              <div className="entry-card stack" key={entryIndex}>
                <div
                  className="row wrap"
                  style={{ justifyContent: 'space-between' }}
                >
                  <strong>Sample #{entryIndex + 1}</strong>
                  <div className="row wrap">
                    <span className="badge">metadata entry</span>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => toggleMetadataEdit(entryIndex)}
                    >
                      {metadataEditByEntry[entryIndex] ? 'Finish' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleResampleEntry(entryIndex)}
                      disabled={resamplingIndex === entryIndex || metadataEditByEntry[entryIndex]}
                    >
                      {resamplingIndex === entryIndex
                        ? 'Resampling...'
                        : 'Resample this entry'}
                    </button>
                  </div>
                </div>

                {metadataEditByEntry[entryIndex] ? (
                  <textarea
                    className="jsonl-editor"
                    value={metadataTextByEntry[entryIndex] ?? ''}
                    onChange={(e) => updateMetadataText(entryIndex, e.target.value)}
                    placeholder='{"id": "...", "text": "..."}'
                  />
                ) : (
                  <pre>{metadataTextByEntry[entryIndex] ?? formatJsonForEditor(entry.metadata)}</pre>
                )}

                <div className="qa-block stack">
                  <div
                    className="row wrap"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <strong>Stage-1 questions</strong>
                    <span className="small">One JSON object per line</span>
                  </div>
                  <textarea
                    className="jsonl-editor"
                    value={qaTextByEntry[entryIndex]?.stage1 ?? ''}
                    onChange={(e) =>
                      updateQaText(entryIndex, 'stage1', e.target.value)
                    }
                    placeholder={`{"question": "Is the speaker in their twenties?", "answer": "Yes."}
{"question": "Identify the speaker's age group.", "answer": "twenties"}`}
                  />
                </div>

                <div className="qa-block stack">
                  <div
                    className="row wrap"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <strong>Stage-2 questions</strong>
                    <span className="small">One JSON object per line</span>
                  </div>
                  <textarea
                    className="jsonl-editor"
                    value={qaTextByEntry[entryIndex]?.stage2 ?? ''}
                    onChange={(e) =>
                      updateQaText(entryIndex, 'stage2', e.target.value)
                    }
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