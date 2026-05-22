import { NextRequest, NextResponse } from "next/server";
import { extractNERData } from "@/lib/ner";
import {
  checkAndRecordRateLimitAtomic,
  getAppSettingsAdmin,
  getRateLimitQuota,
} from "@/lib/ai-rate-limit";

// Get current quota without recording (for UI display)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const settings = await getAppSettingsAdmin();
    const quota = await getRateLimitQuota(userId, settings);
    return NextResponse.json(quota);
  } catch (error) {
    console.error('Error getting quota:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, type, userId } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    if (!type || (type !== 'lost' && type !== 'found')) {
      return NextResponse.json(
        { error: 'Type must be "lost" or "found"' },
        { status: 400 }
      );
    }

    const settings = await getAppSettingsAdmin();

    // Check and record rate limit atomically if userId is provided
    if (userId) {
      const rateLimitResult = await checkAndRecordRateLimitAtomic(userId, settings, 'ner');

      if (!rateLimitResult.allowed) {
        return NextResponse.json(
          {
            error: 'rate_limit_exceeded',
            reason: rateLimitResult.reason,
            message: rateLimitResult.message || 'คุณใช้งาน AI บ่อยเกินไป กรุณารอสักครู่',
            userRemainingMinute: rateLimitResult.userRemainingMinute,
            userRemainingHour: rateLimitResult.userRemainingHour,
            systemRemainingMinute: rateLimitResult.systemRemainingMinute,
            systemRemainingHour: rateLimitResult.systemRemainingHour,
            resetMinute: rateLimitResult.resetMinute.toISOString(),
            resetHour: rateLimitResult.resetHour.toISOString(),
          },
          { status: 429 }
        );
      }
    }

    const result = await extractNERData(text, type, {
      model: settings.aiNerModel,
      temperature: settings.aiNerTemperature,
      topP: settings.aiNerTopP,
      maxOutputTokens: settings.aiNerMaxOutputTokens,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to extract data from text' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in NER API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
