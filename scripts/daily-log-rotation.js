#!/usr/bin/env node

const { exec } = require('child_process');
const path = require('path');

/**
 * Daily log rotation script for PM2
 * This script should be run daily via cron job
 */
function performDailyRotation() {
  const projectRoot = path.join(__dirname, '..');
  console.log(`[${new Date().toISOString()}] Starting daily log rotation for Devore AI API`);
  
  // Step 1: Setup today's log directories and update ecosystem config
  console.log('Step 1: Setting up daily log directories...');
  exec('node scripts/setup-daily-logs.js', { cwd: projectRoot }, (error, stdout, stderr) => {
    if (error) {
      console.error('Error setting up daily logs:', error);
      return;
    }
    console.log(stdout);
    
    // Step 2: Rotate existing logs
    console.log('Step 2: Rotating existing logs...');
    exec('node scripts/rotate-logs.js rotate', { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        console.error('Error rotating logs:', error);
        return;
      }
      console.log(stdout);
      
      // Step 3: Restart PM2 processes with new log paths
      console.log('Step 3: Restarting PM2 processes...');
      exec('pm2 restart ecosystem.config.js', { cwd: projectRoot }, (error, stdout, stderr) => {
        if (error) {
          console.error('Error restarting PM2:', error);
          return;
        }
        console.log('PM2 processes restarted with new log paths');
        
        // Step 4: Cleanup old logs (keep last 30 days)
        console.log('Step 4: Cleaning up old logs...');
        exec('node scripts/rotate-logs.js cleanup 30', { cwd: projectRoot }, (error, stdout, stderr) => {
          if (error) {
            console.error('Error cleaning up logs:', error);
            return;
          }
          console.log(stdout);
          console.log(`[${new Date().toISOString()}] Daily log rotation completed successfully!`);
        });
      });
    });
  });
}

// Run if called directly
if (require.main === module) {
  performDailyRotation();
}

module.exports = performDailyRotation;