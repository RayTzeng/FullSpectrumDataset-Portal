import { NextRequest, NextResponse } from 'next/server';
import { saveSubmission } from '@/lib/submissions';
import { validateSubmissionPayload } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    validateSubmissionPayload(payload);
    const saved = await saveSubmission(payload);
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Submission failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
