import { NextRequest, NextResponse } from "next/server";
import { extractVisionData } from "@/lib/vision";
import {
  checkAndRecordRateLimitAtomic,
  getAppSettingsAdmin,
  getRateLimitQuota,
} from "@/lib/ai-rate-limit";

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const settings = await getAppSettingsAdmin();
    const quota = await getRateLimitQuota(userId, settings);
    return NextResponse.json(quota);
  } catch (error) {
    console.error("Error getting quota:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageDataUrl, imageBase64, mimeType, userId } = body as {
      imageDataUrl?: string;
      imageBase64?: string;
      mimeType?: string;
      userId?: string;
    };

    let parsedMime = mimeType;
    let parsedBase64 = imageBase64;

    if (imageDataUrl) {
      const parsed = parseDataUrl(imageDataUrl);
      if (!parsed) {
        return NextResponse.json({ error: "Invalid image data URL" }, { status: 400 });
      }
      parsedMime = parsed.mimeType;
      parsedBase64 = parsed.base64;
    }

    if (!parsedBase64 || !parsedMime) {
      return NextResponse.json(
        { error: "imageDataUrl or imageBase64 + mimeType required" },
        { status: 400 }
      );
    }

    const settings = await getAppSettingsAdmin();

    if (userId) {
      const rateLimitResult = await checkAndRecordRateLimitAtomic(userId, settings, "vision");
      if (!rateLimitResult.allowed) {
        return NextResponse.json(
          {
            error: "rate_limit_exceeded",
            reason: rateLimitResult.reason,
            message: rateLimitResult.message || "AI rate limit exceeded. Please try again shortly.",
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

    const visionData = await extractVisionData(parsedBase64, parsedMime, {
      model: settings.aiVisionModel,
      temperature: settings.aiVisionTemperature,
      topP: settings.aiVisionTopP,
      maxOutputTokens: settings.aiVisionMaxOutputTokens,
    });

    if (!visionData) {
      return NextResponse.json({ error: "Vision analysis failed" }, { status: 500 });
    }

    return NextResponse.json({ data: visionData });
  } catch (error) {
    console.error("Error in vision API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
