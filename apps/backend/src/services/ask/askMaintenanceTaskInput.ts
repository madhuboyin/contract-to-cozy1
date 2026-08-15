const REQUEST_FRAMING = /^(?:(?:please|kindly)\s+)?(?:(?:i\s+(?:want|need)\s+to|i(?:['’]d|\s+would)\s+like\s+to|can\s+you|could\s+you|would\s+you|will\s+you|help\s+me(?:\s+to)?)\s+)/i;
const GENERIC_TASK_TITLE = /^(?:(?:a|another|the)\s+)?(?:maintenance(?: task| item| work)?|task|home maintenance)$/;

export function isMeaningfulMaintenanceTaskTitle(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ');
  return !GENERIC_TASK_TITLE.test(normalized);
}

export function extractMaintenanceTaskTitle(message: string): string | undefined {
  let title = message.trim()
    .replace(REQUEST_FRAMING, '')
    .replace(/^(?:please\s+)?(?:create|add|schedule|set up)\s+(?:(?:a|the)\s+)?(?:(?:maintenance\s+)?task\s+(?:to|for)\s+|maintenance\s+(?:to\s+)?)/i, '')
    .replace(/^(?:please\s+)?(?:create|add|schedule|set up)\s+(?:(?:a|the)\s+)?/i, '')
    .replace(/^(?:please\s+)?(?:remind me to|put on my maintenance list)\s+/i, '')
    .replace(/\s+(?:to|on)\s+my maintenance list\s*$/i, '');
  title = title.split(/\b(?:today|tomorrow|next week|next month|in \d{1,3} (?:days?|weeks?|months?)|on \d{4}-\d{2}-\d{2}|by \d{4}-\d{2}-\d{2}|daily|weekly|monthly|quarterly|annually|annual|every (?:day|week|month|year|three months|3 months)|twice a year|semi[ -]?annually|urgent|high priority|low priority|estimated cost|for \$)\b/i)[0]
    .replace(/[.,;:!?\s]+$/g, '')
    .trim();
  if (!title || !isMeaningfulMaintenanceTaskTitle(title)) return undefined;
  return `${title.charAt(0).toUpperCase()}${title.slice(1)}`.slice(0, 160);
}
