#!/usr/bin/env bun
/**
 * Generates src/abi.ts from the compiled Foundry artifacts.
 * Run after any contract change: bun run scripts/generate-abi.ts
 * This file is the single source of truth for the app's ABIs —
 * never edit src/abi.ts by hand.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadAbi(artifactPath: string) {
  const raw = readFileSync(resolve(root, artifactPath), 'utf8');
  const artifact = JSON.parse(raw) as { abi: unknown[] };
  return artifact.abi;
}

const circleAbi = loadAbi('contracts/out/AjoCircle.sol/AjoCircle.json');
const factoryAbi = loadAbi('contracts/out/AjoFactory.sol/AjoFactory.json');

const out = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: contracts/out/AjoCircle.sol/AjoCircle.json
 *         contracts/out/AjoFactory.sol/AjoFactory.json
 * Regenerate: bun run scripts/generate-abi.ts
 */

export const AJO_CIRCLE_ABI = ${JSON.stringify(circleAbi, null, 2)} as const;

export const AJO_FACTORY_ABI = ${JSON.stringify(factoryAbi, null, 2)} as const;
`;

const dest = resolve(root, 'src/abi.ts');
writeFileSync(dest, out);
console.log(`Written ${dest}`);
