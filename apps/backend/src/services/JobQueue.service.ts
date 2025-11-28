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
        // Use the same Redis configuration as the worker
        const redisHost = process.env.REDIS_HOST || 'localhost';
        const redisPortEnv = process.env.REDIS_PORT;
        
        // FIX: Defensive parsing of REDIS_PORT. Ensure it's not an empty string, 
        // which causes parseInt to return NaN. Default to 6379 if invalid.
        const port = parseInt(
            (redisPortEnv && redisPortEnv.trim() !== '') ? redisPortEnv : '6379', 
            10
        );
        
        const redisConnection = {
            host: redisHost,
            port: port, 
        };

        // Initialize the queue connection
        this.queue = new Queue(this.queueName, { 
            connection: redisConnection 
        });

        console.log(`[QUEUE-CLIENT] Initialized queue: ${this.queueName} at ${redisHost}:${port}`);
    }

    async addJob(jobName: string, data: JobData, options?: any): Promise<void> {
      console.log(`[QUEUE] Job added: ${jobName} for Property ID: ${data.propertyId}`);
      
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