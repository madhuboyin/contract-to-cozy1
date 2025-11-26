// apps/backend/src/services/JobQueue.service.ts

interface JobData {
    propertyId: string;
    [key: string]: any;
  }
  
  /**
   * Simplified service wrapper for adding jobs to the asynchronous background queue.
   */
  class JobQueueService {
    private queueName = 'main-background-queue';
  
    async addJob(jobName: string, data: JobData, options?: any): Promise<void> {
      console.log(`[QUEUE] Job added: ${jobName} for Property ID: ${data.propertyId}`);
      
      // Placeholder for actual queuing logic (e.g., BullMQ's queue.add(jobName, data, options))
      // In a real application, this sends the job to a dedicated queue (Redis).
      return; 
    }
  }
  
  export default new JobQueueService();