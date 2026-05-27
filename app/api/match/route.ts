import { NextRequest, NextResponse } from 'next/server';
import { getLostItems, getFoundItems, updateLostItem, updateFoundItem, getAppSettings } from '@/lib/firestore';
import { 
  findMatchesForLostItem, 
  findMatchesForFoundItem, 
  findMatchesForLostItemAI,
  findMatchesForFoundItemAI,
  getMatchConfidence 
} from '@/lib/matching';

export async function POST(request: NextRequest) {
  try {
    const { expireOverdueFoundItemsAdmin } = await import("@/lib/found-handover-expiry-server");
    await expireOverdueFoundItemsAdmin();

    const body = await request.json();
    const { type, itemId, useAI = false } = body;

    if (!type || (type !== 'lost' && type !== 'found')) {
      return NextResponse.json(
        { error: 'Type must be "lost" or "found"' },
        { status: 400 }
      );
    }

    if (!itemId || typeof itemId !== 'string') {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    // Fetch all items
    const [allLostItems, allFoundItems] = await Promise.all([
      getLostItems(),
      getFoundItems(),
    ]);

    let matches;

    const aiSettings = useAI ? await getAppSettings() : null;
    const aiConfig = aiSettings
      ? {
          model: aiSettings.aiMatchingModel,
          temperature: aiSettings.aiMatchingTemperature,
          topP: aiSettings.aiMatchingTopP,
          maxOutputTokens: aiSettings.aiMatchingMaxOutputTokens,
        }
      : undefined;

    if (type === 'lost') {
      const lostItem = allLostItems.find(item => item.id === itemId);
      if (!lostItem) {
        return NextResponse.json(
          { error: 'Lost item not found' },
          { status: 404 }
        );
      }
      // Use AI matching if requested
      matches = useAI 
        ? await findMatchesForLostItemAI(lostItem, allFoundItems, 5, aiConfig)
        : findMatchesForLostItem(lostItem, allFoundItems);
    } else {
      const foundItem = allFoundItems.find(item => item.id === itemId);
      if (!foundItem) {
        return NextResponse.json(
          { error: 'Found item not found' },
          { status: 404 }
        );
      }
      // Use AI matching if requested
      matches = useAI
        ? await findMatchesForFoundItemAI(foundItem, allLostItems, 5, aiConfig)
        : findMatchesForFoundItem(foundItem, allLostItems);
    }

    // Format matches for response
    const formattedMatches = matches.map(match => ({
      ...match,
      confidence: getMatchConfidence(match.score),
      scorePercentage: Math.round(match.score * 100),
    }));

    return NextResponse.json({
      matches: formattedMatches,
      total: formattedMatches.length,
      useAI,
    });
  } catch (error) {
    console.error('Error in Match API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
