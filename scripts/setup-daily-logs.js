#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Setup daily log directories and update PM2 ecosystem config
 */
function setupDailyLogs() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const logDir = path.join(__dirname, '../logs');
  const todayDir = path.join(logDir, today);
  const yesterdayDir = path.join(logDir, yesterday);
  
  // Create directories if they don't exist
  [logDir, todayDir, yesterdayDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });
  
  // Generate ecosystem config with date-based paths
  const ecosystemConfig = {
    apps: [
      {
        name: 'devore-dev',
        script: './src/server.ts',
        interpreter: 'npx',
        interpreter_args: 'ts-node',
        env: {
          NODE_ENV: 'development',
          PORT: '8000',
          API_URL: 'http://localhost:8000',
          FRONTEND_URL: 'http://localhost:3000',
          JWT_SECRET: '8c4220094ec2d9da86aa869b18a4519e6db6641d8bd510403ee8dca4eb3ba896',
          
          // Database
          DATABASE_URL: 'postgres://postgres:root@192.168.1.227:5432/Devore-Ai-local',
          
          // Email Configuration
          MAIL_USERNAME: '', // Add your email username
          MAIL_PASSWORD: '', // Add your email password
          MAIL_HOST: 'smtp.freesmtpservers.com',
          MAIL_PORT: '25',
          MAIL_FROM: '"Devore AI" <devoreai@gmail.com',
          
          // Queue Management
          RABBIT_MQ_URL: 'amqp://root:password@localhost:5672',
          QUEUE_PREFIX: 'devore-dev',
          
          // AWS S3 Configuration
          AWS_REGION: 'us-east-1',
          AWS_ACCESS_KEY_ID: 'your_access_key',
          AWS_SECRET_ACCESS_KEY: 'your_secret_key',
          AWS_S3_BUCKET: 'Devore-Ai-development',
          AWS_S3_CDN_URL: 'https://your-cloudfront-url.com',
          
          // SMS Services
          AWS_SNS_REGION: 'us-east-1',
          AWS_SNS_ACCESS_KEY_ID: 'your_sns_access_key',
          AWS_SNS_SECRET_ACCESS_KEY: 'your_sns_secret_key',
          AWS_SNS_SENDER_ID: 'DevoreAI'
        },
        instances: 1,
        exec_mode: 'fork',
        watch: false,
        max_memory_restart: '500M',
        error_file: `./logs/${today}/devore-dev-error.log`,
        out_file: `./logs/${today}/devore-dev-out.log`,
        log_file: `./logs/${today}/devore-dev-combined.log`,
        time: true
      },
      {
        name: 'devore-local',
        script: './src/server.ts',
        interpreter: 'npx',
        interpreter_args: 'ts-node',
        env: {
          NODE_ENV: 'development',
          PORT: '8001',
          API_URL: 'http://localhost:8001',
          FRONTEND_URL: 'http://localhost:3000',
          JWT_SECRET: '8c4220094ec2d9da86aa869b18a4519e6db6641d8bd510403ee8dca4eb3ba896',
          
          // Database - Local instance
          DATABASE_URL: 'postgres://postgres:root@localhost:5432/devore-local',
          
          // Email Configuration
          MAIL_USERNAME: '', // Add your email username
          MAIL_PASSWORD: '', // Add your email password
          MAIL_HOST: 'smtp.freesmtpservers.com',
          MAIL_PORT: '25',
          MAIL_FROM: '"devore Local" <noreply@devore.local',
          
          // Queue Management - Local
          RABBIT_MQ_URL: 'amqp://guest:guest@localhost:5672',
          QUEUE_PREFIX: 'devore-local',
          
          // AWS S3 Configuration - Local/Development
          AWS_REGION: 'us-east-1',
          AWS_ACCESS_KEY_ID: 'your_local_access_key',
          AWS_SECRET_ACCESS_KEY: 'your_local_secret_key',
          AWS_S3_BUCKET: 'devore-local-dev',
          AWS_S3_CDN_URL: 'https://your-local-cloudfront-url.com',
          
          // SMS Services - Local
          AWS_SNS_REGION: 'us-east-1',
          AWS_SNS_ACCESS_KEY_ID: 'your_local_sns_access_key',
          AWS_SNS_SECRET_ACCESS_KEY: 'your_local_sns_secret_key',
          AWS_SNS_SENDER_ID: 'devoreLocal'
        },
        instances: 1,
        exec_mode: 'fork',
        watch: false,
        max_memory_restart: '500M',
        error_file: `./logs/${today}/devore-local-error.log`,
        out_file: `./logs/${today}/devore-local-out.log`,
        log_file: `./logs/${today}/devore-local-combined.log`,
        time: true
      }
    ]
  };
  
  // Write updated ecosystem config
  const configPath = path.join(__dirname, '../ecosystem.config.js');
  const configContent = `module.exports = ${JSON.stringify(ecosystemConfig, null, 2)};`;
  
  fs.writeFileSync(configPath, configContent);
  console.log(`Updated ecosystem.config.js with date-based logs for ${today}`);
  
  return { today, yesterday, todayDir, yesterdayDir };
}

// Run if called directly
if (require.main === module) {
  const result = setupDailyLogs();
  console.log('Daily logs setup completed!');
  console.log(`Today's logs: ${result.todayDir}`);
  console.log(`Yesterday's logs: ${result.yesterdayDir}`);
}

module.exports = setupDailyLogs;