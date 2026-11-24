export const COMPUTE_MAX_SOURCE_BYTES = 32_768;
export const COMPUTE_MIN_TIMEOUT_MS = 100;
export type ComputeKind = "python" | "latex";
export type ComputeStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "canceled"
  | "abandoned"
  | "output_limit";

export type ComputeJobView = {
  id: string;
  kind: ComputeKind;
  status: ComputeStatus;
  timeoutMs: number;
  elapsedMs: number | null;
  stdout: string;
  stderr: string;
  hasPdf: boolean;
  createdAt: string;
  completedAt: string | null;
  cancelRequested: boolean;
};

export type ComputeOverview = {
  available: boolean;
  canRun: boolean;
  limits: {
    pythonRemainingMs: number;
    pythonTimeoutMs: number;
    latexRemaining: number;
    latexTimeoutMs: number;
  };
  jobs: ComputeJobView[];
};
