'use client';

import { useSyncExternalStore } from 'react';

const noChange = () => () => {};

/** "hamere.example.org/exam" — the address students open; "/exam" during the server render. */
export function useExamAddress(): string {
  return useSyncExternalStore(noChange, () => `${window.location.host}/exam`, () => '/exam');
}
