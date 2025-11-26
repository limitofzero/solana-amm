#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, '../src/lib/version.ts');

try {
  const content = fs.readFileSync(versionFile, 'utf8');
  const versionMatch = content.match(/export const APP_VERSION = "(\d+)\.(\d+)\.(\d+)";/);
  
  if (!versionMatch) {
    console.error('Could not parse version from version.ts');
    process.exit(1);
  }
  
  const major = parseInt(versionMatch[1]);
  const minor = parseInt(versionMatch[2]);
  const patch = parseInt(versionMatch[3]);
  
  // Increment patch version
  const newVersion = `${major}.${minor}.${patch + 1}`;
  const newContent = `export const APP_VERSION = "${newVersion}";\n`;
  
  fs.writeFileSync(versionFile, newContent);
  console.log(`Version incremented to ${newVersion}`);
} catch (error) {
  console.error('Error incrementing version:', error);
  process.exit(1);
}

