import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
} from 'pdf-lib';

/**
 * Raw form data pulled out of a D&D Beyond PDF export.
 *
 * DDB's "Export to PDF" (generated server-side with PDFsharp) writes every
 * value as a form-field *widget annotation* on the page, but does not link
 * them into a usable /AcroForm catalog entry — so pdf-lib's form API sees an
 * empty form. We therefore walk each page's /Annots array directly and read
 * the field name (/T), type (/FT) and value (/V) off the raw dictionaries.
 *
 * Field names repeat across pages (every spell page restarts at
 * "spellName0"), so consumers that care about document structure must use
 * `fields`, which preserves page number and position in reading order.
 * `text`/`checked` are convenience maps holding the first non-empty value
 * per whitespace-normalized name.
 */
export interface ExtractedField {
  name: string;
  page: number;
  /** Widget rectangle origin (PDF points, y grows upward). */
  x: number;
  y: number;
  value: string | boolean;
}

export interface ExtractedSheet {
  /** Every widget field, ordered by page, then top-to-bottom, left-to-right. */
  fields: ExtractedField[];
  /** First non-empty text value per normalized field name. */
  text: Map<string, string>;
  /** Checkbox state per normalized field name. */
  checked: Map<string, boolean>;
}

export class PdfExtractionError extends Error {}

export function normalizeFieldName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

const PDF_MAGIC = '%PDF';

/**
 * Decode a PDF text object. PDFsharp (DDB's generator) wraps long hex
 * strings with a newline every 100 characters; the PDF spec says whitespace
 * inside hex strings must be ignored, but pdf-lib's decodeText() feeds it to
 * the hex parser and produces garbage — so decode hex strings ourselves.
 */
export function decodeTextObject(obj: unknown): string | null {
  if (obj instanceof PDFHexString) {
    const hex = obj.asString().replace(/[^0-9a-fA-F]/g, '');
    const bytes = new Uint8Array(Math.ceil(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2).padEnd(2, '0'), 16);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes.slice(2));
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes.slice(2));
    }
    return new TextDecoder('latin1').decode(bytes);
  }
  if (obj instanceof PDFString) {
    try {
      return obj.decodeText();
    } catch {
      return null;
    }
  }
  return null;
}

interface WidgetInfo {
  name: string;
  fieldType: PDFName | null;
  value: unknown;
  /** The dict that owns /T — used to dedupe multi-widget fields. */
  owner: PDFDict | null;
}

/** Resolve /T, /FT and /V for a widget, walking the /Parent chain. */
function resolveWidget(doc: PDFDocument, widget: PDFDict): WidgetInfo | null {
  const parts: string[] = [];
  let fieldType: PDFName | null = null;
  let value: unknown;
  let owner: PDFDict | null = null;

  let dict: PDFDict | undefined = widget;
  const visited = new Set<PDFDict>();
  while (dict && !visited.has(dict)) {
    visited.add(dict);
    const t = decodeTextObject(dict.get(PDFName.of('T')));
    if (t !== null) {
      parts.unshift(t);
      owner ??= dict;
    }
    const ft = dict.get(PDFName.of('FT'));
    if (fieldType === null && ft instanceof PDFName) fieldType = ft;
    if (value === undefined) {
      const v = dict.get(PDFName.of('V'));
      if (v !== undefined) value = v;
    }
    const parentRef = dict.get(PDFName.of('Parent'));
    dict = parentRef ? doc.context.lookupMaybe(parentRef, PDFDict) : undefined;
  }

  if (parts.length === 0) return null;
  return { name: normalizeFieldName(parts.join('.')), fieldType, value, owner };
}

export async function extractSheetFields(bytes: Uint8Array): Promise<ExtractedSheet> {
  // The spec allows the %PDF marker anywhere in the first 1024 bytes.
  const header = new TextDecoder('latin1').decode(bytes.slice(0, 1024));
  if (!header.includes(PDF_MAGIC)) {
    throw new PdfExtractionError(
      'That file is not a PDF. Export your character from D&D Beyond with "Export to PDF" and upload the result.'
    );
  }

  let doc: PDFDocument;
  try {
    // DDB exports are sometimes flagged with owner encryption; we only read
    // field values, so ignoring it is safe.
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch (err) {
    throw new PdfExtractionError(
      `Could not read the PDF: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const fields: ExtractedField[] = [];
  const seenOwners = new Set<PDFDict>();

  doc.getPages().forEach((page, pageIndex) => {
    const annots = page.node.Annots();
    if (!annots) return;

    for (let i = 0; i < annots.size(); i++) {
      let widget: PDFDict | undefined;
      try {
        widget = annots.lookupMaybe(i, PDFDict);
      } catch {
        continue;
      }
      if (!widget) continue;
      if (widget.get(PDFName.of('Subtype')) !== PDFName.of('Widget')) continue;

      const info = resolveWidget(doc, widget);
      if (!info || !info.name) continue;
      if (info.owner) {
        if (seenOwners.has(info.owner)) continue;
        seenOwners.add(info.owner);
      }

      let x = 0;
      let y = 0;
      const rect = widget.lookupMaybe(PDFName.of('Rect'), PDFArray);
      if (rect && rect.size() >= 2) {
        x = rect.lookupMaybe(0, PDFNumber)?.asNumber() ?? 0;
        y = rect.lookupMaybe(1, PDFNumber)?.asNumber() ?? 0;
      }

      if (info.fieldType === PDFName.of('Btn')) {
        // Checkbox / radio state lives in /V (field) or /AS (widget). Plain
        // pushbuttons (e.g. DDB's "CHARACTER IMAGE") have neither — skip them.
        const state = info.value ?? widget.get(PDFName.of('AS'));
        if (!(state instanceof PDFName)) continue;
        const checked = state !== PDFName.of('Off');
        fields.push({ name: info.name, page: pageIndex, x, y, value: checked });
      } else {
        // Treat everything else (Tx, Ch, unknown) as text.
        const value = decodeTextObject(info.value) ?? '';
        fields.push({ name: info.name, page: pageIndex, x, y, value });
      }
    }
  });

  if (fields.length === 0) {
    // No widgets: this is a flattened copy (print-to-PDF / viewer re-save).
    // The values survive in the text layer at the same positions — hand off
    // to the geometry-based fallback.
    const { extractFlattenedSheet } = await import('./flattened-extractor');
    return extractFlattenedSheet(bytes);
  }

  // Reading order: page, then top-to-bottom (PDF y grows upward), then
  // left-to-right. The spell-list parser relies on this to carry the
  // current spell level across rows and page breaks.
  fields.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

  const text = new Map<string, string>();
  const checked = new Map<string, boolean>();
  for (const field of fields) {
    if (typeof field.value === 'boolean') {
      checked.set(field.name, (checked.get(field.name) ?? false) || field.value);
    } else if (field.value.trim() !== '' && !text.has(field.name)) {
      text.set(field.name, field.value.trim());
    }
  }

  return { fields, text, checked };
}
