import type { Vulnerability } from './vuln';

export type WorkerInMsg = { type: 'fetch'; url: string };

export type WorkerOutMsg =
  | { type: 'progress'; bytes: number }
  | { type: 'items'; items: Vulnerability[] }
  | { type: 'done' }
  | { type: 'error'; error: string }
  | { type: 'log'; message: string };

