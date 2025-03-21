import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function generateVoiceover(text: string): Promise<string> {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY || '';
    
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.statusText} (${response.status}) - ${errorText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const key = `voiceovers/${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: key,
        Body: Buffer.from(audioBuffer),
        ContentType: 'audio/mpeg',
        ACL: 'public-read',
      })
    );

    return `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`;
  } catch (error) {
    console.error('Error generating voiceover:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    const voiceoverUrl = await generateVoiceover(text);

    return NextResponse.json({ url: voiceoverUrl });
  } catch (error) {
    console.error('Error processing voiceover request:', error);
    return NextResponse.json(
      { error: 'Failed to generate voiceover' },
      { status: 500 }
    );
  }
}
