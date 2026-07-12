import { NextResponse } from 'next/server';
import { convertDDBtoRoll20 } from '@/lib/converter';

export async function POST(req: Request) {
  try {
    const data = await req.json();

    if (!data || !data.character) {
      return NextResponse.json({ error: 'Invalid D&D Beyond JSON' }, { status: 400 });
    }

    const charId = data.character.id || Date.now().toString();

    // Perform conversion
    const roll20Json = convertDDBtoRoll20(data);

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
