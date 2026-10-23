'use client';
/*
 * PDF.js is loaded on demand (never in other modules' bundles). Parsing runs
 * in a dedicated same-origin worker; documents are opened from verified
 * in-memory bytes only, with XFA disabled. (PDF.js 6 has no eval path.)
 * The legacy build polyfills very new JavaScript built-ins that PDF.js 6
 * uses (e.g. Map.prototype.getOrInsertComputed), so current browsers that
 * have not shipped them can still read.
 */
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let engine: Promise<PdfJs> | null = null;
export function loadPdfEngine() {
  engine ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' },
    );
    return pdfjs;
  });
  return engine;
}
export async function openPdf(bytes: ArrayBuffer) {
  const pdfjs = await loadPdfEngine();
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: false,
  });
  try {
    return { pdf: await task.promise, destroy: () => task.destroy() };
  } catch (error) {
    await task.destroy();
    throw error;
  }
}
export type PdfDocument = Awaited<ReturnType<typeof openPdf>>['pdf'];
export type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;
