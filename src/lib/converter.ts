import { extractSheetFields } from './pdf-extractor';
import { parseCharacterSheet } from './sheet-parser';
import { buildRoll20Character, Vttes1Character } from './roll20-builder';

/**
 * Full pipeline: D&D Beyond PDF export (WotC form-fillable template) →
 * VTTES schema_version 1 JSON, importable into Roll20 via the
 * VTT Enhancement Suite's "Import Character" journal button.
 */
export async function convertPdfToRoll20(bytes: Uint8Array): Promise<Vttes1Character> {
  const extracted = await extractSheetFields(bytes);
  const sheet = parseCharacterSheet(extracted);
  return buildRoll20Character(sheet);
}
