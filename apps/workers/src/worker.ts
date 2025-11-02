import dotenv from 'dotenv';

dotenv.config();

console.log('🔧 Contract to Cozy Worker starting...');
console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);

// Placeholder worker - replace with your actual worker logic
const runWorker = async () => {
  console.log('✓ Worker initialized');
  console.log('⏳ Worker running... (placeholder)');
  
  // Keep the process alive
  setInterval(() => {
    console.log(`💓 Worker heartbeat: ${new Date().toISOString()}`);
  }, 60000); // Every minute
};

runWorker().catch((error) => {
  console.error('Worker error:', error);
  process.exit(1);
});
