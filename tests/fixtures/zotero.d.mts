import type { Server } from 'node:http';
export declare const keys: {
  read: string;
  write: string;
  revoked: string;
  limited: string;
  slow: string;
};
export declare const state: {
  updated: boolean;
  deleted: Set<string>;
  requests: {
    method: string | undefined;
    path: string;
    query: string;
    hasKey: boolean;
    version: string | string[] | undefined;
  }[];
};
export declare function startZoteroFixture(): Promise<Server>;
