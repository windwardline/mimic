import type { ExtractedField, ExtractedSheet } from './pdf-extractor';
import { PdfExtractionError } from './pdf-extractor';
import { PAGE_FIELD_RECTS, PAGE_LABELS, TemplatePageType } from './ddb-geometry';

/**
 * Fallback extractor for FLATTENED copies of D&D Beyond exports — files that
 * went through a browser's print-to-PDF or a viewer's "save as", which
 * discards the form widgets and bakes the values into the page text layer.
 *
 * The flattened text sits exactly where the widgets were (same template), so
 * we read positioned text with pdf.js, drop the template's static labels,
 * and assign what remains back to field names via the widget-rectangle
 * registry in ddb-geometry.ts. Spell rows have no per-row rectangles worth
 * trusting (header and row slots overlap), so those are parsed by their
 * fixed column bands instead. The output is the same ExtractedSheet shape
 * the widget path produces, feeding the identical parser.
 *
 * Limitations vs. the widget path: checkbox state (death saves, inspiration)
 * is drawn as vector art, not text, so it is not recoverable.
 */

interface TextItem {
  s: string;
  x: number;
  y: number;
  w: number;
}

interface TextPage {
  index: number;
  items: TextItem[];
}

async function readTextPages(bytes: Uint8Array): Promise<TextPage[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdf.js mutates/transfers the buffer it is given — hand it a copy.
  const doc = await getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    verbosity: 0,
    useSystemFonts: true,
  }).promise;
  const pages: TextPage[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const item of content.items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        items.push({
          s: item.str,
          x: item.transform[4],
          y: item.transform[5],
          w: item.width,
        });
      }
      pages.push({ index: p - 1, items });
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

function classifyPage(items: TextItem[]): TemplatePageType | null {
  const text = items.map((i) => i.s).join(' ');
  if (text.includes('WEAPON ATTACKS')) return 'core';
  if (text.includes('CHARACTER BACKSTORY')) return 'details';
  if (text.includes('SPELL SAVE DC')) return 'spells';
  if (text.includes('WEIGHT CARRIED')) return 'equipment';
  if (text.includes('EQUIPMENT')) return 'equipmentExtra';
  return null;
}

/** Template chrome: any item matching a known label run (text + position). */
function buildLabelFilter(type: TemplatePageType): (item: TextItem) => boolean {
  const byText = new Map<string, [number, number][]>();
  for (const [s, x, y] of PAGE_LABELS[type]) {
    const positions = byText.get(s) ?? [];
    positions.push([x, y]);
    byText.set(s, positions);
  }
  return (item) => {
    const positions = byText.get(item.s);
    if (!positions) return false;
    return positions.some(([x, y]) => Math.abs(item.x - x) <= 2 && Math.abs(item.y - y) <= 2);
  };
}

/** Join items into text, preserving line breaks and intra-line spacing. */
function joinItems(items: TextItem[]): string {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: string[] = [];
  let line = '';
  let prev: TextItem | null = null;
  for (const item of sorted) {
    if (prev && Math.abs(item.y - prev.y) > 3) {
      lines.push(line);
      line = item.s;
    } else if (prev) {
      const gap = item.x - (prev.x + prev.w);
      line += (gap > 1.2 ? ' ' : '') + item.s;
    } else {
      line = item.s;
    }
    prev = item;
  }
  if (line !== '') lines.push(line);
  return lines.join('\n').trim();
}

const RECT_PAD = 2.5;

/** Assign items to the smallest registry rectangle containing them. */
function assignToRects(
  type: TemplatePageType,
  items: TextItem[],
  page: number,
  out: ExtractedField[]
): TextItem[] {
  const rects = Object.entries(PAGE_FIELD_RECTS[type]);
  const byField = new Map<string, TextItem[]>();
  const unassigned: TextItem[] = [];

  for (const item of items) {
    let best: string | null = null;
    let bestArea = Infinity;
    for (const [name, [x0, y0, x1, y1]] of rects) {
      if (
        item.x >= x0 - RECT_PAD &&
        item.x <= x1 + RECT_PAD &&
        item.y >= y0 - RECT_PAD &&
        item.y <= y1 + RECT_PAD
      ) {
        const area = (x1 - x0) * (y1 - y0);
        if (area < bestArea) {
          bestArea = area;
          best = name;
        }
      }
    }
    if (best) {
      const list = byField.get(best) ?? [];
      list.push(item);
      byField.set(best, list);
    } else {
      unassigned.push(item);
    }
  }

  for (const [name, fieldItems] of byField) {
    const value = joinItems(fieldItems);
    if (value === '') continue;
    const top = fieldItems.reduce((a, b) => (a.y >= b.y ? a : b));
    out.push({ name, page, x: top.x, y: top.y, value });
  }
  return unassigned;
}

/**
 * Spell rows by fixed column bands (x ranges from the template's widget
 * grid). Level headers ("=== 2nd LEVEL ===") occupy the name column;
 * whatever shares their row ("4 Slots OOOO") is the slot header.
 */
const SPELL_COLUMNS: { field: string; from: number; to: number }[] = [
  { field: 'spellPrepared', from: 20, to: 42 },
  { field: 'spellName', from: 42, to: 150 },
  { field: 'spellSource', from: 150, to: 232 },
  { field: 'spellSaveHit', from: 232, to: 258 },
  { field: 'spellCastingTime', from: 258, to: 277 },
  { field: 'spellRange', from: 277, to: 320 },
  { field: 'spellComponents', from: 320, to: 342 },
  { field: 'spellDuration', from: 342, to: 390 },
  { field: 'spellPage', from: 390, to: 423 },
  { field: 'spellNotes', from: 423, to: 600 },
];

/** "=== CANTRIPS ===" → 0, "=== 3rd LEVEL ===" → 3, else null. */
function spellHeaderIndex(text: string): number | null {
  if (/cantrip/i.test(text)) return 0;
  const match = text.match(/(\d)\s*(?:st|nd|rd|th)?\s*level/i);
  return match ? parseInt(match[1], 10) : null;
}

function parseSpellRows(items: TextItem[], page: number, out: ExtractedField[]): void {
  // Rows live below the column-header line; group items into visual rows.
  const rowMap = new Map<number, TextItem[]>();
  for (const item of items) {
    if (item.y > 660 || item.y < 45) continue; // casting header / footer zones
    let key: number | null = null;
    for (const existing of rowMap.keys()) {
      if (Math.abs(existing - item.y) <= 3) {
        key = existing;
        break;
      }
    }
    if (key === null) key = item.y;
    const row = rowMap.get(key) ?? [];
    row.push(item);
    rowMap.set(key, row);
  }

  const rows = [...rowMap.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r);

  let rowIndex = 0;
  let lastRowCells: Map<string, ExtractedField> | null = null;
  for (const row of rows) {
    const headerItem = row.find((i) => /^===/.test(i.s.trim()));
    if (headerItem) {
      const level = spellHeaderIndex(headerItem.s);
      if (level === null) continue;
      out.push({
        name: `spellHeader${level}`,
        page,
        x: headerItem.x,
        y: headerItem.y,
        value: headerItem.s.trim(),
      });
      const slotText = joinItems(row.filter((i) => i !== headerItem));
      if (slotText !== '') {
        out.push({ name: `spellSlotHeader${level}`, page, x: headerItem.x, y: headerItem.y, value: slotText });
      }
      lastRowCells = null;
      continue;
    }

    const cells = new Map<string, TextItem[]>();
    for (const item of row) {
      const column = SPELL_COLUMNS.find((c) => item.x >= c.from && item.x < c.to);
      if (!column) continue;
      const list = cells.get(column.field) ?? [];
      list.push(item);
      cells.set(column.field, list);
    }
    if (cells.size === 0) continue;

    if (!cells.has('spellName') && lastRowCells) {
      // Wrapped continuation of the previous row: append to its cells.
      for (const [field, cellItems] of cells) {
        const text = joinItems(cellItems);
        const existing = lastRowCells.get(field);
        if (existing) {
          existing.value = `${existing.value} ${text}`;
        } else {
          const first = cellItems[0];
          const rowIdx = rowIndex - 1;
          const created: ExtractedField = {
            name: `${field}${rowIdx}`,
            page,
            x: first.x,
            y: first.y,
            value: text,
          };
          out.push(created);
          lastRowCells.set(field, created);
        }
      }
      continue;
    }
    if (!cells.has('spellName')) continue;

    const emitted = new Map<string, ExtractedField>();
    for (const [field, cellItems] of cells) {
      const first = cellItems[0];
      const created: ExtractedField = {
        name: `${field}${rowIndex}`,
        page,
        x: first.x,
        y: first.y,
        value: joinItems(cellItems),
      };
      out.push(created);
      emitted.set(field, created);
    }
    lastRowCells = emitted;
    rowIndex++;
  }
}

export async function extractFlattenedSheet(bytes: Uint8Array): Promise<ExtractedSheet> {
  const pages = await readTextPages(bytes);

  const fields: ExtractedField[] = [];
  for (const page of pages) {
    const type = classifyPage(page.items);
    if (!type) continue;
    const isLabel = buildLabelFilter(type);
    const values = page.items.filter((i) => !isLabel(i));
    const rest = assignToRects(type, values, page.index, fields);
    if (type === 'spells') parseSpellRows(rest, page.index, fields);
  }

  if (fields.length === 0) {
    throw new PdfExtractionError(
      'No character data was found in this PDF. Upload the file exactly as D&D Beyond exported it ' +
        '("Export to PDF" on the character sheet).'
    );
  }

  fields.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

  const text = new Map<string, string>();
  const checked = new Map<string, boolean>();
  for (const field of fields) {
    if (typeof field.value === 'string' && field.value.trim() !== '' && !text.has(field.name)) {
      text.set(field.name, field.value.trim());
    }
  }

  return { fields, text, checked };
}
