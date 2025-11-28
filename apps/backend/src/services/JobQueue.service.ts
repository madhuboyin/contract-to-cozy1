// apps/backend/src/services/JobQueue.service.ts

import { Queue } from 'bullmq'; 
import * as dotenv from 'dotenv'; 
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
    private queue: Queue; 
    
    constructor() {
        // FIX: Hardcoded port 6379 to bypass deployment env var issues (NaN)
        const port = 6379; 
        
        // Build the connection options object, including optional auth/db
        const redisConnection: any = { // Using 'any' for the complex BullMQ type definition
            host: process.env.REDIS_HOST || 'localhost',
            port: port,
            // ADDED: Support for optional Redis password (REDIS_PASSWORD)
            password: process.env.REDIS_PASSWORD, 
            // ADDED: Support for Redis DB index (REDIS_DB: "0" from ConfigMap)
            db: parseInt(process.env.REDIS_DB || '0', 10), 
        };

        // Initialize the queue connection
        this.queue = new Queue(this.queueName, { 
            connection: redisConnection 
        });

        console.log(`[QUEUE-CLIENT] Initialized queue: ${this.queueName} at ${redisConnection.host}:${port} (DB: ${redisConnection.db})`);
    }

    async addJob(jobName: string, data: JobData, options?: any): Promise<void> {
      console.log(`[QUEUE] Job added: ${jobName} for Property ID: ${data.propertyId}`);
      
      // Actual queuing logic using BullMQ's queue.add()
      await this.queue.add(
          jobName, 
          data,    
          { 
              ...options, 
              attempts: 3, 
              backoff: {
                  type: 'exponential',
                  delay: 5000,
              },
          }
      );
      
      return; 
    }
  }
  
  export default new JobQueueService();