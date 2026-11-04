import { useVideoConfig } from 'remotion';

export type Layout = {
  portrait: boolean;
  width: number;
  height: number;
  /** Pick a value per orientation. */
  pick: <T>(landscape: T, portrait: T) => T;
};

export const useLayout = (): Layout => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  return {
    portrait,
    width,
    height,
    pick: <T,>(landscape: T, portraitValue: T): T => (portrait ? portraitValue : landscape),
  };
};
