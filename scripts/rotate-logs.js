#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Rotate and organize PM2 logs by date
 */
function rotateLogs() {
  const logsDir = path.join(__dirname, '../logs');
  const today = new Date().toISOString().split('T')[0];
  const todayDir = path.join(logsDir, today);
  
  // Create today's directory if it doesn't exist
  if (!fs.existsSync(todayDir)) {
    fs.mkdirSync(todayDir, { recursive: true });
    console.log(`Created directory: ${todayDir}`);
  }
  
  // Get all log files in the main logs directory
  const logFiles = fs.readdirSync(logsDir).filter(file => 
    file.endsWith('.log') && fs.statSync(path.join(logsDir, file)).isFile()
  );
  
  console.log(`Found ${logFiles.length} log files to rotate`);
  
  // Move log files to appropriate date directories
  logFiles.forEach(file => {
    const filePath = path.join(logsDir, file);
    const stats = fs.statSync(filePath);
    const fileDate = stats.mtime.toISOString().split('T')[0];
    const targetDir = path.join(logsDir, fileDate);
    
    // Create date directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`Created directory: ${targetDir}`);
    }
    
    // Move file to date directory
    const targetPath = path.join(targetDir, file);
    fs.renameSync(filePath, targetPath);
    console.log(`Moved ${file} to ${fileDate}/ directory`);
  });
  
  console.log('Log rotation completed!');
}

/**
 * Clean up old log files (older than specified days)
 */
function cleanupOldLogs(daysToKeep = 30) {
  const logsDir = path.join(__dirname, '../logs');
  const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000));
  
  // Get all date directories
  const dateDirs = fs.readdirSync(logsDir).filter(dir => {
    const dirPath = path.join(logsDir, dir);
    return fs.statSync(dirPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(dir);
  });
  
  console.log(`Checking ${dateDirs.length} date directories for cleanup`);
  
  let deletedCount = 0;
  dateDirs.forEach(dateDir => {
    const dirDate = new Date(dateDir);
    if (dirDate < cutoffDate) {
      const dirPath = path.join(logsDir, dateDir);
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`Deleted old log directory: ${dateDir}`);
      deletedCount++;
    }
  });
  
  console.log(`Cleanup completed! Deleted ${deletedCount} old log directories`);
}

/**
 * List logs by date
 */
function listLogsByDate() {
  const logsDir = path.join(__dirname, '../logs');
  
  if (!fs.existsSync(logsDir)) {
    console.log('No logs directory found');
    return;
  }
  
  const dateDirs = fs.readdirSync(logsDir).filter(dir => {
    const dirPath = path.join(logsDir, dir);
    return fs.statSync(dirPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(dir);
  }).sort().reverse(); // Most recent first
  
  console.log('\n📅 Available Log Dates:');
  console.log('=' .repeat(50));
  
  dateDirs.forEach(dateDir => {
    const dirPath = path.join(logsDir, dateDir);
    const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.log'));
    
    let dateLabel = dateDir;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    if (dateDir === today) dateLabel += ' (Today)';
    else if (dateDir === yesterday) dateLabel += ' (Yesterday)';
    
    console.log(`\n📁 ${dateLabel}`);
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      const sizeKB = (stats.size / 1024).toFixed(1);
      console.log(`   📄 ${file} (${sizeKB} KB)`);
    });
  });
  
  console.log('\n' + '=' .repeat(50));
  console.log(`Total log dates: ${dateDirs.length}`);
}

// Command line interface
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'rotate':
      rotateLogs();
      break;
    case 'cleanup':
      const days = parseInt(process.argv[3]) || 30;
      cleanupOldLogs(days);
      break;
    case 'list':
      listLogsByDate();
      break;
    default:
      console.log('PM2 Log Management');
      console.log('==================');
      console.log('');
      console.log('Usage:');
      console.log('  node scripts/rotate-logs.js rotate          # Move logs to date directories');
      console.log('  node scripts/rotate-logs.js cleanup [days]  # Delete logs older than X days (default: 30)');
      console.log('  node scripts/rotate-logs.js list            # List all logs by date');
      console.log('');
      console.log('Examples:');
      console.log('  node scripts/rotate-logs.js rotate');
      console.log('  node scripts/rotate-logs.js cleanup 7       # Keep only last 7 days');
      console.log('  node scripts/rotate-logs.js list');
  }
}

module.exports = { rotateLogs, cleanupOldLogs, listLogsByDate };