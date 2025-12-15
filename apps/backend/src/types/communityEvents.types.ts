export interface CommunityEventDTO {
    id: string;
    source: string;
    title: string;
    startTime: string;
    endTime: string | null;
    externalUrl: string;
    isActive: boolean;
  }
  
  export interface GetCommunityEventsResponse {
    events: CommunityEventDTO[];
  }
  