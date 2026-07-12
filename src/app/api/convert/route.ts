import { NextResponse } from 'next/server';
import { bucket } from '@/lib/gcs';
import { convertDDBtoRoll20 } from '@/lib/converter';

export async function POST(req: Request) {
  try {
    const data = await req.json();

    if (!data || !data.character) {
      return NextResponse.json({ error: 'Invalid D&D Beyond JSON' }, { status: 400 });
    }

    const charId = data.character.id || Date.now().toString();
    const timestamp = Date.now();

    // Perform conversion
    const roll20Json = convertDDBtoRoll20(data);

    // Run GCS uploads asynchronously in the background so we don't block the response
    Promise.all([
      bucket.file(`raw_${charId}_${timestamp}.json`).save(JSON.stringify(data)),
      bucket.file(`roll20_${charId}_${timestamp}.json`).save(JSON.stringify(roll20Json))
    ]).catch(err => console.error('Failed to upload to GCS:', err));

    // Return the converted file as a downloadable attachment
    return new NextResponse(JSON.stringify(roll20Json, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="roll20_${charId}.json"`
      }
    });

  } catch (error: any) {
    console.error('Conversion Error:', error);
    return NextResponse.json(
      { error: 'Failed to convert character', details: error.message }, 
      { status: 500 }
    );
  }
}
