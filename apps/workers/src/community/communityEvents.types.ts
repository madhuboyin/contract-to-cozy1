export interface ExternalCommunityEvent {
    externalId: string;
    title: string;
    description?: string | null;
    startTime: Date;
    endTime?: Date | null;
    venueName?: string | null;
    externalUrl: string;
  }
  