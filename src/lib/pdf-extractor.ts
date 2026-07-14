import { PDFCheckBox, PDFDocument, PDFTextField } from 'pdf-lib';

/**
 * Raw form data pulled out of a D&D Beyond PDF export.
 * Keys are whitespace-normalized field names (trimmed, internal runs of
 * whitespace collapsed to one space) because the WotC template contains
 * names like "Race ", "DEXmod " and "SpellSaveDC  2".
 */
export interface ExtractedSheet {
  text: Map<string, string>;
  checked: Map<string, boolean>;
}

export class PdfExtractionError extends Error {}

export function normalizeFieldName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

const PDF_MAGIC = '%PDF';

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

  const text = new Map<string, string>();
  const checked = new Map<string, boolean>();

  let fields: ReturnType<ReturnType<PDFDocument['getForm']>['getFields']> = [];
  try {
    fields = doc.getForm().getFields();
  } catch {
    // No AcroForm at all — handled by the empty-fields error below.
  }

  for (const field of fields) {
    const name = normalizeFieldName(field.getName());
    if (field instanceof PDFTextField) {
      let value = '';
      try {
        value = field.getText() ?? '';
      } catch {
        // Malformed appearance streams shouldn't sink the whole conversion.
      }
      if (value.trim() !== '') text.set(name, value.trim());
    } else if (field instanceof PDFCheckBox) {
      checked.set(name, field.isChecked());
    }
  }

  if (fields.length === 0 || (text.size === 0 && checked.size === 0)) {
    throw new PdfExtractionError(
      'No fillable form fields were found in this PDF. Make sure you upload the PDF exactly as exported by D&D Beyond ' +
        '("Export to PDF" on the character sheet) — printed or flattened copies lose their form data.'
    );
  }

  return { text, checked };
}
