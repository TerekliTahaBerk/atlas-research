'use client';
import { createContext, useContext } from 'react';
/** State that NodeViews read from the surrounding document screen. */
export interface DocUiState {
  commentsResolved: boolean;
  openComments: () => void;
  flash: (message: string, tone?: 'done' | 'info') => void;
  openTask: (id: string) => void;
}
export const DocUi = createContext<DocUiState>({
  commentsResolved: false,
  openComments: () => {},
  flash: () => {},
  openTask: () => {},
});
export function useDocUi() {
  return useContext(DocUi);
}
