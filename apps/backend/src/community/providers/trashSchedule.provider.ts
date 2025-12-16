// apps/backend/src/community/providers/trashSchedule.provider.ts

import { TrashScheduleResponse, TrashSchedule } from '../types/community.types';
import { getCityOpenDataSources } from './citySources.provider';

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Use AI to parse trash schedule information from city websites
 */
export async function parseTrashScheduleWithAI(
  city: string,
  state: string
): Promise<TrashScheduleResponse> {
  try {
    // Get official city sources
    const cityData = getCityOpenDataSources(city, state);
    const trashSources = cityData.items.filter(
      (item) => item.category === 'TRASH_RECYCLING'
    );

    if (trashSources.length === 0) {
      return {
        city,
        state,
        schedules: [],
        lastUpdated: new Date().toISOString(),
        source: 'No official sources available',
      };
    }

    // Fetch the actual content from the city website
    const sourceUrl = trashSources[0].url;
    let htmlContent = '';

    try {
      const response = await fetch(sourceUrl);
      htmlContent = await response.text();
    } catch (error) {
      console.error(`Failed to fetch ${sourceUrl}:`, error);
      return {
        city,
        state,
        schedules: [],
        lastUpdated: new Date().toISOString(),
        source: sourceUrl,
      };
    }

    // Use AI to extract schedule information
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `You are a helpful assistant that extracts trash and recycling schedule information from city websites.

City: ${city}, ${state}
Source URL: ${sourceUrl}

HTML Content (first 10000 chars):
${htmlContent.substring(0, 10000)}

Extract the trash collection schedule and return ONLY a valid JSON object with this structure:
{
  "schedules": [
    {
      "type": "trash" | "recycling" | "yard_waste" | "bulk",
      "frequency": "Weekly on [day]" or "Every other [day]" or similar,
      "nextPickup": "YYYY-MM-DD" (if determinable, otherwise null),
      "notes": "Any special instructions"
    }
  ]
}

Important:
- Extract actual schedule patterns (e.g., "Weekly on Mondays", "Every other Tuesday")
- Calculate nextPickup date if possible based on current date: ${new Date().toISOString().split('T')[0]}
- If information is unclear, set frequency to "Check city website" and nextPickup to null
- Return ONLY the JSON object, no additional text`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse AI response
    let parsed: { schedules: TrashSchedule[] };
    try {
      // Try to extract JSON from response (in case AI adds extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(responseText);
      }
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      console.error('Response:', responseText);
      parsed = { schedules: [] };
    }

    return {
      city,
      state,
      schedules: parsed.schedules || [],
      lastUpdated: new Date().toISOString(),
      source: sourceUrl,
    };
  } catch (error) {
    console.error(`Error parsing trash schedule for ${city}, ${state}:`, error);
    return {
      city,
      state,
      schedules: [],
      lastUpdated: new Date().toISOString(),
      source: 'Error fetching schedule',
    };
  }
}

/**
 * Calculate next pickup date based on day of week
 */
export function calculateNextPickup(dayOfWeek: string, isEveryOtherWeek = false): string | null {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDay = days.indexOf(dayOfWeek.toLowerCase());
  
  if (targetDay === -1) return null;

  const today = new Date();
  const currentDay = today.getDay();
  
  let daysUntilNext = (targetDay - currentDay + 7) % 7;
  if (daysUntilNext === 0) daysUntilNext = 7; // If today, schedule for next week

  if (isEveryOtherWeek) {
    daysUntilNext += 7; // Add a week for every-other-week schedule
  }

  const nextPickup = new Date(today);
  nextPickup.setDate(today.getDate() + daysUntilNext);

  return nextPickup.toISOString().split('T')[0];
}