import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

interface GenerationResponse {
  artifacts: Array<{
    base64: string;
    seed: number;
    finishReason: string;
  }>;
}

async function uploadImageToS3(imageBuffer: Buffer, contentType: string = 'image/png'): Promise<string> {
  const key = `channel-images/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType,
      ACL: 'public-read',
    })
  );

  return `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`;
}

async function generateImage(prompt: string): Promise<string> {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) throw new Error('Missing Stability API key.');

  const apiHost = process.env.STABILITY_API_HOST ?? 'https://api.stability.ai';
  const engineId = 'stable-diffusion-xl-1024-v1-0';

  const response = await fetch(
    `${apiHost}/v1/generation/${engineId}/text-to-image`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        text_prompts: [
          {
            text: prompt,
          },
        ],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        steps: 30,
        samples: 1,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Stability AI API error: ${await response.text()}`);
  }

  const responseJSON = (await response.json()) as GenerationResponse;
  
  if (!responseJSON.artifacts?.[0]?.base64) {
    throw new Error('No image generated');
  }

  const imageBuffer = Buffer.from(responseJSON.artifacts[0].base64, 'base64');
  return uploadImageToS3(imageBuffer);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const imageUrl = await generateImage(prompt);

    return NextResponse.json({ url: imageUrl });
  } catch (error) {
    console.error('Error processing image generation request:', error);
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    );
  }
}
