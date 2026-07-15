#!/usr/bin/env node
/**
 * Regenerates src/lib/ddb-geometry.ts from real (annotated) D&D Beyond PDF
 * exports. Run with one or more exports covering every page type:
 *
 *   node scripts/generate-ddb-geometry.mjs ~/Downloads/Character_1.pdf ~/Downloads/Character_2.pdf
 *
 * The registry records each field's widget rectangle per template page type,
 * which the flattened-PDF fallback uses to assign loose text back to fields.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFString, PDFHexString } =
  require('pdf-lib');

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '../src/lib/ddb-geometry.ts');

function decodeText(obj) {
  if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.decodeText();
  return null;
}

async function readWidgets(path) {
  const bytes = await readFile(path);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = [];
  doc.getPages().forEach((page) => {
    const found = [];
    const annots = page.node.Annots();
    if (annots) {
      for (let i = 0; i < annots.size(); i++) {
        const dict = annots.lookupMaybe(i, PDFDict);
        if (!dict || dict.get(PDFName.of('Subtype')) !== PDFName.of('Widget')) continue;
        const name = decodeText(dict.get(PDFName.of('T')))?.replace(/\s+/g, ' ').trim();
        const ft = dict.get(PDFName.of('FT'));
        const rect = dict.lookupMaybe(PDFName.of('Rect'), PDFArray);
        if (!name || !rect || rect.size() < 4) continue;
        const r = [0, 1, 2, 3].map((k) => Math.round(rect.lookupMaybe(k, PDFNumber)?.asNumber() ?? 0));
        // PDF rects may list corners in any order — normalize to [min, max].
        found.push({
          name,
          isText: ft === PDFName.of('Tx'),
          rect: [
            Math.min(r[0], r[2]),
            Math.min(r[1], r[3]),
            Math.max(r[0], r[2]),
            Math.max(r[1], r[3]),
          ],
        });
      }
    }
    pages.push(found);
  });
  return pages;
}

function classify(fields) {
  const names = new Set(fields.map((f) => f.name));
  if (names.has('STR') && names.has('Wpn Name')) return 'core';
  if (names.has('CP')) return 'equipment';
  if (names.has('GENDER')) return 'details';
  if (names.has('spellCastingClass0')) return 'spells';
  if ([...names].some((n) => /^Eq Name\d+$/.test(n))) return 'equipmentExtra';
  return null;
}

const SKIP = [
  /^spell(?!CastingClass0$|CastingAbility0$|SaveDC0$|AtkBonus0$)/, // spell rows/headers: column-parsed
  /Blank/i,
  /^CHARACTER IMAGE$/,
];

const registries = {
  core: new Map(),
  equipment: new Map(),
  equipmentExtra: new Map(),
  details: new Map(),
  spells: new Map(),
};

/**
 * The annotated exports' text layer contains ONLY the template's static
 * labels (values live in widgets) — capture them so the flattened fallback
 * can drop template chrome before assigning text to fields.
 */
async function readLabels(path) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await readFile(path));
  const doc = await getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .filter((i) => 'str' in i && i.str.trim() !== '')
        .map((i) => [i.str, Math.round(i.transform[4]), Math.round(i.transform[5])])
    );
  }
  return pages;
}

const labelRegistries = {
  core: new Map(),
  equipment: new Map(),
  equipmentExtra: new Map(),
  details: new Map(),
  spells: new Map(),
};

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: generate-ddb-geometry.mjs <ddb-export.pdf>...');
  process.exit(1);
}

for (const file of files) {
  const pages = await readWidgets(file);
  const labelPages = await readLabels(file);
  pages.forEach((fields, index) => {
    const type = classify(fields);
    if (!type) {
      console.warn(`${file} page ${index + 1}: unrecognized page type, skipped`);
      return;
    }
    for (const [s, x, y] of labelPages[index] ?? []) {
      labelRegistries[type].set(`${s}@${x},${y}`, [s, x, y]);
    }
    const registry = registries[type];
    // Spell rows are parsed by column position, not by rect; the spell-page
    // registry only carries the casting header scalars.
    const SPELLS_KEEP = new Set([
      'spellCastingClass0',
      'spellCastingAbility0',
      'spellSaveDC0',
      'spellAtkBonus0',
    ]);
    for (const field of fields) {
      if (!field.isText) continue;
      if (type === 'spells' && !SPELLS_KEEP.has(field.name)) continue;
      if (SKIP.some((p) => p.test(field.name))) continue;
      const existing = registry.get(field.name);
      if (existing && existing.join() !== field.rect.join()) {
        console.warn(`rect conflict for ${type}/${field.name}: ${existing} vs ${field.rect}`);
        continue;
      }
      registry.set(field.name, field.rect);
    }
  });
}

let out = `/**
 * Widget rectangles per template page type, generated from real D&D Beyond
 * PDF exports by scripts/generate-ddb-geometry.mjs. The flattened-PDF
 * fallback (flattened-extractor.ts) uses these to assign loose text items
 * back to the field names the sheet parser expects.
 *
 * Coordinates are PDF points, [x0, y0, x1, y1], y growing upward.
 * DO NOT EDIT BY HAND — regenerate instead.
 */

export type TemplatePageType = 'core' | 'equipment' | 'equipmentExtra' | 'details' | 'spells';

export type FieldRect = [number, number, number, number];

export const PAGE_FIELD_RECTS: Record<TemplatePageType, Record<string, FieldRect>> = {
`;
for (const [type, registry] of Object.entries(registries)) {
  out += `  ${type}: {\n`;
  const names = [...registry.keys()].sort();
  for (const name of names) {
    out += `    ${JSON.stringify(name)}: [${registry.get(name).join(', ')}],\n`;
  }
  out += `  },\n`;
}
out += `};\n`;

out += `
/**
 * Static template label runs per page type: [text, x, y]. A flattened PDF's
 * text layer interleaves these with the character's values; matching items
 * (same text within ~2pt) are template chrome and must be dropped.
 */
export const PAGE_LABELS: Record<TemplatePageType, [string, number, number][]> = {
`;
for (const [type, registry] of Object.entries(labelRegistries)) {
  out += `  ${type}: [\n`;
  for (const [s, x, y] of registry.values()) {
    out += `    [${JSON.stringify(s)}, ${x}, ${y}],\n`;
  }
  out += `  ],\n`;
}
out += `};\n`;

await writeFile(OUT_PATH, out);
for (const [type, registry] of Object.entries(registries)) {
  console.log(`${type}: ${registry.size} fields`);
}
console.log(`wrote ${OUT_PATH}`);
