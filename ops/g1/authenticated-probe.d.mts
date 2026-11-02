export declare const TARGET_REF: 'hgngonpirctrwbckhbmy';
export declare const TARGET_URL: string;
export type Verdict =
  | 'DENIED'
  | 'EXPOSED'
  | 'INCONCLUSIVE_TOKEN_INVALID'
  | 'INCONCLUSIVE_TOKEN_CHANGED'
  | 'INCONCLUSIVE_NETWORK'
  | 'INCONCLUSIVE_NOT_PERMISSION_DENIAL';
export declare function classify(input: {
  userBefore: boolean;
  history?: number | null;
  historyCode?: string | null;
  userAfter?: boolean;
}): Verdict;
export declare function runProbe(input: {
  baseUrl?: string;
  publishableKey: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  verdict: Verdict;
  evidence: {
    target: string;
    userBeforeStatus: number | null;
    historyStatus: number | null;
    historyCode: string | null;
    userAfterStatus: number | null;
  };
}>;
