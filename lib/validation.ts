import type { SubmissionPayload, SeedInstructionItem, QAItem } from '@/lib/types';

function isQAItem(value: unknown): value is QAItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.question === 'string' && v.question.trim().length > 0 && typeof v.answer === 'string';
}

function isSeedInstructionItem(value: unknown): value is SeedInstructionItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.metadata === 'object' &&
    Array.isArray(v.stage1_QA) && v.stage1_QA.every(isQAItem) &&
    Array.isArray(v.stage2_QA) && v.stage2_QA.every(isQAItem)
  );
}

export function validateSubmissionPayload(value: unknown): asserts value is SubmissionPayload {
  if (!value || typeof value !== 'object') {
    throw new Error('Submission payload must be an object.');
  }

  const v = value as Record<string, unknown>;
  if (typeof v.datasetName !== 'string' || !v.datasetName.trim()) {
    throw new Error('datasetName is required.');
  }
  if (typeof v.taskName !== 'string' || !v.taskName.trim()) {
    throw new Error('taskName is required.');
  }
  if (typeof v.taskDefinition !== 'string' || !v.taskDefinition.trim()) {
    throw new Error('taskDefinition is required.');
  }
  if (!Array.isArray(v.seedInstructions) || v.seedInstructions.length === 0) {
    throw new Error('seedInstructions must be a non-empty array.');
  }
  if (!v.seedInstructions.every(isSeedInstructionItem)) {
    throw new Error('Each seed instruction entry must contain metadata, stage1_QA, and stage2_QA.');
  }
}
