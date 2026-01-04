#!/usr/bin/env node

/**
 * Validation script for TASK-002: TypeScript Configuration
 * Tests that tsconfig.json meets all acceptance criteria
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tests = [];
const errors = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assertTrue(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    errors.push(`${message}: expected ${expected}, got ${actual}`);
  }
}

/**
 * Strip comments from JSON (supports TypeScript's tsconfig.json format)
 * Handles both multiline and single-line comments while preserving strings
 */
function stripJsonComments(jsonString) {
  let result = '';
  let inString = false;
  let inMultilineComment = false;
  let inSinglelineComment = false;
  let stringDelimiter = null;

  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];
    const nextChar = jsonString[i + 1];
    const prevChar = jsonString[i - 1];

    // Handle string boundaries
    if (!inMultilineComment && !inSinglelineComment) {
      if ((char === '"' || char === "'") && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringDelimiter = char;
        } else if (char === stringDelimiter) {
          inString = false;
          stringDelimiter = null;
        }
      }
    }

    // Handle comments
    if (!inString) {
      // Start of multiline comment
      if (!inSinglelineComment && char === '/' && nextChar === '*') {
        inMultilineComment = true;
        i++; // Skip the *
        continue;
      }

      // End of multiline comment
      if (inMultilineComment && char === '*' && nextChar === '/') {
        inMultilineComment = false;
        i++; // Skip the /
        continue;
      }

      // Start of single-line comment
      if (!inMultilineComment && char === '/' && nextChar === '/') {
        inSinglelineComment = true;
        i++; // Skip the second /
        continue;
      }

      // End of single-line comment
      if (inSinglelineComment && char === '\n') {
        inSinglelineComment = false;
        result += char; // Keep the newline
        continue;
      }
    }

    // Add character if not in comment
    if (!inMultilineComment && !inSinglelineComment) {
      result += char;
    }
  }

  return result;
}

// Test 1: tsconfig.json exists and is valid JSON
test('tsconfig.json exists and is valid JSON', async () => {
  try {
    const content = await readFile(join(__dirname, 'tsconfig.json'), 'utf-8');
    const cleanContent = stripJsonComments(content);
    const config = JSON.parse(cleanContent);
    assertTrue(config !== null, 'tsconfig.json should be valid JSON');
    return config;
  } catch (err) {
    errors.push(`Failed to read tsconfig.json: ${err.message}`);
    return null;
  }
});

// Test 2: Strict mode enabled
test('Strict mode and all strict flags enabled', async () => {
  const content = await readFile(join(__dirname, 'tsconfig.json'), 'utf-8');
  const config = JSON.parse(stripJsonComments(content));
  const opts = config.compilerOptions;

  assertEquals(opts.strict, true, 'strict should be true');
  assertEquals(opts.noImplicitAny, true, 'noImplicitAny should be true');
  assertEquals(opts.strictNullChecks, true, 'strictNullChecks should be true');
  assertEquals(opts.strictFunctionTypes, true, 'strictFunctionTypes should be true');
  assertEquals(opts.strictBindCallApply, true, 'strictBindCallApply should be true');
  assertEquals(opts.strictPropertyInitialization, true, 'strictPropertyInitialization should be true');
  assertEquals(opts.noImplicitThis, true, 'noImplicitThis should be true');
  assertEquals(opts.alwaysStrict, true, 'alwaysStrict should be true');
});

// Test 3: Additional strict checks
test('Additional strict checks enabled', async () => {
  const content = await readFile(join(__dirname, 'tsconfig.json'), 'utf-8');
  const config = JSON.parse(stripJsonComments(content));
  const opts = config.compilerOptions;

  assertEquals(opts.noUnusedLocals, true, 'noUnusedLocals should be true');
  assertEquals(opts.noUnusedParameters, true, 'noUnusedParameters should be true');
  assertEquals(opts.noImplicitReturns, true, 'noImplicitReturns should be true');
  assertEquals(opts.noFallthroughCasesInSwitch, true, 'noFallthroughCasesInSwitch should be true');
  assertEquals(opts.noUncheckedIndexedAccess, true, 'noUncheckedIndexedAccess should be true');
});

// Test 4: Source maps enabled
test('Source maps and declaration maps enabled', async () => {
  const content = await readFile(join(__dirname, 'tsconfig.json'), 'utf-8');
  const config = JSON.parse(stripJsonComments(content));
  const opts = config.compilerOptions;

  assertEquals(opts.sourceMap, true, 'sourceMap should be true');
  assertEquals(opts.declaration, true, 'declaration should be true');
  assertEquals(opts.declarationMap, true, 'declarationMap should be true');
});

// Test 5: Cloudflare Workers configuration
test('Cloudflare Workers types configured', async () => {
  const content = await readFile(join(__dirname, 'tsconfig.json'), 'utf-8');
  const config = JSON.parse(stripJsonComments(content));
  const opts = config.compilerOptions;

  assertTrue(opts.types && opts.types.includes('@cloudflare/workers-types'),
    'types should include @cloudflare/workers-types');
  assertEquals(opts.target, 'ES2021', 'target should be ES2021');
  assertTrue(opts.lib && opts.lib.includes('ES2021'), 'lib should include ES2021');
});

// Test 6: Module configuration for Workers
test('ES modules configuration', async () => {
  const content = await readFile(join(__dirname, 'tsconfig.json'), 'utf-8');
  const config = JSON.parse(stripJsonComments(content));
  const opts = config.compilerOptions;

  assertEquals(opts.module, 'ES2022', 'module should be ES2022');
  assertEquals(opts.moduleResolution, 'bundler', 'moduleResolution should be bundler');
  assertEquals(opts.esModuleInterop, true, 'esModuleInterop should be true');
});

// Test 7: Path aliases configured
test('Path aliases configured', async () => {
  const content = await readFile(join(__dirname, 'tsconfig.json'), 'utf-8');
  const config = JSON.parse(stripJsonComments(content));
  const opts = config.compilerOptions;

  assertTrue(opts.paths && opts.paths['@/*'], 'paths should include @/* alias');
  assertTrue(Array.isArray(opts.paths['@/*']) && opts.paths['@/*'][0] === 'src/*',
    '@/* should map to src/*');
});

// Test 8: Include/exclude configured
test('Include and exclude arrays configured', async () => {
  const content = await readFile(join(__dirname, 'tsconfig.json'), 'utf-8');
  const config = JSON.parse(stripJsonComments(content));

  assertTrue(Array.isArray(config.include), 'include should be an array');
  assertTrue(config.include.includes('src/**/*'), 'include should contain src/**/*');
  assertTrue(config.include.includes('tests/**/*'), 'include should contain tests/**/*');

  assertTrue(Array.isArray(config.exclude), 'exclude should be an array');
  assertTrue(config.exclude.includes('node_modules'), 'exclude should contain node_modules');
  assertTrue(config.exclude.includes('dist'), 'exclude should contain dist');
});

// Run all tests
async function runTests() {
  console.log('Running TASK-002 validation tests...\n');

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✅ ${name}`);
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
      console.log(`❌ ${name}`);
    }
  }

  console.log(`\nTests completed: ${tests.length - errors.length}/${tests.length} passed`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(err => console.log(`  - ${err}`));
    process.exit(1);
  } else {
    console.log('\n✅ All acceptance criteria validated!');
    process.exit(0);
  }
}

runTests();
