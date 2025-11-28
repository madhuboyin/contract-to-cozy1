// apps/backend/src/services/JobQueue.service.ts

import { Queue } from 'bullmq'; // Import BullMQ Queue
import * as dotenv from 'dotenv'; // For reading Redis config
dotenv.config();

interface JobData {
    propertyId: string;
    [key: string]: any;
  }
  
  /**
   * Simplified service wrapper for adding jobs to the asynchronous background queue.
   */
  class JobQueueService {
    private queueName = 'main-background-queue';
    private queue: Queue; // Instance of BullMQ Queue
    
    constructor() {
        // Use the same Redis configuration as the worker
        const redisConnection = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
        };
        
        // Initialize the queue connection
        this.queue = new Queue(this.queueName, { 
            connection: redisConnection 
        });

        console.log(`[QUEUE-CLIENT] Initialized queue: ${this.queueName}`);
    }

    async addJob(jobName: string, data: JobData, options?: any): Promise<void> {
      console.log(`[QUEUE] Job added: ${jobName} for Property ID: ${data.propertyId}`);
      
      // FIX: Actual queuing logic using BullMQ's queue.add()
      await this.queue.add(
          jobName, // Job name (e.g., 'calculate_risk')
          data,    // Job data (e.g., { propertyId })
          { 
              ...options, 
              // Set job options here, like retry logic, which were mistakenly 
              // placed on the worker earlier.
              attempts: 3, 
              backoff: {
                  type: 'exponential',
                  delay: 5000,
              },
          }
      );
      
      // Return void as specified by the method signature
      return; 
    }
  }
  
  export default new JobQueueService();