// Poppler stdout is capped at 2 MiB. Each 1,100+ character chunk overlaps
// its neighbour by 160 code points, so 5 MiB covers the indexed UTF-8
// text even for multibyte overlaps without charging the PDF blob itself.
export const MAX_INDEX_JOB_BYTES = 5 * 1024 * 1024;
export const INDEX_RESERVATION_MS = 20 * 60 * 1000;
