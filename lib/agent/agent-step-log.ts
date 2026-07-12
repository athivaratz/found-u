export type AgentStepLog = {
  stepNumber: number;
  finishReason?: string;
  outputTokens?: number;
  toolCalls?: string[];
};
