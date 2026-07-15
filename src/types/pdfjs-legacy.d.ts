/**
 * Minimal typings for pdf.js's legacy (Node-compatible) build, which ships
 * without its own .d.ts at this import path. Only the surface used by
 * flattened-extractor.ts is declared.
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export interface PdfJsTextItem {
    str: string;
    transform: number[];
    width: number;
    height: number;
  }

  export interface PdfJsTextContent {
    items: Array<PdfJsTextItem | { type: string }>;
  }

  export interface PdfJsPage {
    getTextContent(): Promise<PdfJsTextContent>;
  }

  export interface PdfJsDocument {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfJsPage>;
    destroy(): Promise<void>;
  }

  export function getDocument(params: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    verbosity?: number;
    useSystemFonts?: boolean;
  }): { promise: Promise<PdfJsDocument> };
}
