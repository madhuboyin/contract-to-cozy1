// apps/backend/src/community/utils/categorizeEvent.ts

import { EventCategory } from '../types/community.types';

/**
 * Categorize events based on title and description keywords
 */
export function categorizeEvent(title: string, description?: string | null): EventCategory {
  const text = `${title} ${description ?? ''}`.toLowerCase();

  // Farmers Market detection
  if (
    text.includes('farmers market') ||
    text.includes("farmer's market") ||
    text.includes('farm market') ||
    text.includes('farmstand') ||
    text.includes('local produce')
  ) {
    return 'FARMERS_MARKET';
  }

  // Food Festival detection
  if (
    text.includes('food festival') ||
    text.includes('food fest') ||
    text.includes('taste of') ||
    text.includes('food truck') ||
    text.includes('culinary') ||
    text.includes('wine tasting') ||
    text.includes('beer festival') ||
    text.includes('restaurant week')
  ) {
    return 'FOOD_FESTIVAL';
  }

  // Library events
  if (
    text.includes('library') ||
    text.includes('book club') ||
    text.includes('reading') ||
    text.includes('author talk') ||
    text.includes('story time') ||
    text.includes('book fair')
  ) {
    return 'LIBRARY';
  }

  // Holiday/Celebration events
  if (
    text.includes('holiday') ||
    text.includes('christmas') ||
    text.includes('thanksgiving') ||
    text.includes('halloween') ||
    text.includes('independence day') ||
    text.includes('july 4') ||
    text.includes('fireworks') ||
    text.includes('new year') ||
    text.includes('easter') ||
    text.includes('memorial day') ||
    text.includes('labor day') ||
    text.includes('celebration') ||
    text.includes('parade')
  ) {
    return 'HOLIDAY';
  }

  // Community events
  if (
    text.includes('community') ||
    text.includes('neighborhood') ||
    text.includes('town hall') ||
    text.includes('block party') ||
    text.includes('community center') ||
    text.includes('local event') ||
    text.includes('municipal') ||
    text.includes('city council') ||
    text.includes('civic')
  ) {
    return 'COMMUNITY';
  }

  return 'OTHER';
}

/**
 * Get display name for event category
 */
export function getCategoryDisplayName(category: EventCategory): string {
  const names: Record<EventCategory, string> = {
    FARMERS_MARKET: "Farmers' Market",
    FOOD_FESTIVAL: 'Food Festival',
    COMMUNITY: 'Community Event',
    LIBRARY: 'Library Event',
    HOLIDAY: 'Holiday & Celebration',
    OTHER: 'Other Event',
  };
  return names[category];
}

/**
 * Get icon class or emoji for event category
 */
export function getCategoryIcon(category: EventCategory): string {
  const icons: Record<EventCategory, string> = {
    FARMERS_MARKET: '🌽',
    FOOD_FESTIVAL: '🍔',
    COMMUNITY: '🏘️',
    LIBRARY: '📚',
    HOLIDAY: '🎉',
    OTHER: '📅',
  };
  return icons[category];
}