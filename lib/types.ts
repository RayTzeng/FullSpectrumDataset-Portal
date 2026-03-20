export type TaskRow = {
  datasetName: string;
  taskName: string;
  taskPath: string;
  targetField: string;
};

export type SampledEntry = Record<string, unknown>;

export type QAItem = {
  question: string;
  answer: string;
};

export type SeedInstructionItem = {
  metadata: SampledEntry;
  stage1_QA: QAItem[];
  stage2_QA: QAItem[];
};

export type SubmissionPayload = {
  datasetName: string;
  taskName: string;
  taskDefinition: string;
  seedInstructions: SeedInstructionItem[];
};
