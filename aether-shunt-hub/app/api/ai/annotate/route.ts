import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateText, AiServiceError } from '@/lib/ai/aiService';
import { ANNOTATE_SYSTEM_PROMPT, buildAnnotateUserPrompt } from '@/lib/ai/annotatePrompt';
import { checkRateLimit } from '@/lib/rate-limit';

const AnnotateSchema = z.object({
  action: z.string().min(1).max(200),
  inputContext: z.unknown(),
  result: z.unknown(),
});

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AnnotateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const { text } = await generateText({
      system: ANNOTATE_SYSTEM_PROMPT,
      user: buildAnnotateUserPrompt(parsed.data),
      maxTokens: 200,
      temperature: 0.3,
    });
    return NextResponse.json({ annotation: text.trim() });
  } catch (err) {
    const status = err instanceof AiServiceError ? err.status ?? 502 : 502;
    const message = err instanceof Error ? err.message : 'AI request failed';
    return NextResponse.json({ error: message, annotation: null }, { status });
  }
}
