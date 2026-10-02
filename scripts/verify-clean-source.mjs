#!/usr/bin/env node
/* =========================================================
   CLEAN SOURCE VERIFICATION (Section A7)
   CI/Build gate that enforces:
   - ZERO occurrences of demo family characters (Arun, Priya, Rahul, Anu)
   - ZERO imports or occurrences of seedData
   in src/
   ========================================================= */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '..', 'src');

const DEMO_NAMES_REGEX = /\b(Arun|Priya|Rahul|Anu)\b/;
const SEED_DATA_REGEX = /seedData/;

let violationsCount = 0;

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      // Check code and asset source files
      if (/\.(ts|tsx|js|jsx|json|css|html|md)$/i.test(entry.name)) {
        checkFile(fullPath);
      }
    }
  }
}

function checkFile(filePath) {
  const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    if (DEMO_NAMES_REGEX.test(line)) {
      console.error(`❌ [DEMO NAME VIOLATION] ${relativePath}:${lineNum}`);
      console.error(`   ${line.trim()}`);
      violationsCount++;
    }

    if (SEED_DATA_REGEX.test(line)) {
      console.error(`❌ [SEEDDATA VIOLATION] ${relativePath}:${lineNum}`);
      console.error(`   ${line.trim()}`);
      violationsCount++;
    }
  });
}

console.log('🔍 Scanning src/ directory for banned demo data strings...');
scanDirectory(SRC_DIR);

if (violationsCount > 0) {
  console.error(`\n🚨 BUILD BLOCKED: Found ${violationsCount} banned demo string occurrence(s) in src/.`);
  console.error('All demo names (Arun, Priya, Rahul, Anu) and seedData references must be completely removed.');
  process.exit(1);
} else {
  console.log('✅ Clean source check passed: Zero demo strings or seedData references found in src/.');
  process.exit(0);
}
