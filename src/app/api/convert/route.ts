import { NextResponse } from 'next/server';
import { convertPdfToRoll20 } from '../../../lib/converter';
import { PdfExtractionError } from '../../../lib/pdf-extractor';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const USAGE_ERROR = 'Upload a D&D Beyond character sheet PDF as the "file" form field.';

export async function POST(req: Request) {
  try {
    // A body that is not multipart form data makes formData() throw. That is
    // the caller's mistake, so it answers 400, not the 500 kept for ours.
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: USAGE_ERROR }, { status: 400 });
    }
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: USAGE_ERROR }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'PDF is too large (15 MB max).' }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const roll20Json = await convertPdfToRoll20(bytes);

    const slug =
      roll20Json.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'character';

    return new NextResponse(JSON.stringify(roll20Json, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="roll20_${slug}.json"`,
      },
    });
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error('Conversion Error:', error);
    return NextResponse.json(
      { error: 'Failed to convert character sheet.' },
      { status: 500 }
    );
  }
}
