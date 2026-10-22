// Read-only check that the contracts live on Arc are byte-for-byte the build Arc Studio compiled
// and tested (studio/contracts/out). Immutable values are filled into the artifact before comparing.
// Usage: node scripts/verify-bytecode.mjs [--testnet]
import { readFileSync } from "node:fs";
import { createPublicClient, http, pad } from "viem";

const testnet = process.argv.includes("--testnet");
const rpc = testnet ? "https://rpc.testnet.arc.io" : "https://rpc.mainnet.arc.io";
const deployment = JSON.parse(readFileSync(`deployments/${testnet ? "testnet" : "mainnet"}.json`, "utf8"));
const client = createPublicClient({ transport: http(rpc) });

// Fill each immutable slot in the compiled runtime code with the value the live contract holds there.
function expectedCode(artifact, live) {
  let code = artifact.deployedBytecode.object.slice(2);
  for (const refs of Object.values(artifact.deployedBytecode.immutableReferences ?? {})) {
    for (const { start, length } of refs) {
      const value = live.slice(2 + start * 2, 2 + (start + length) * 2);
      code = code.slice(0, start * 2) + value + code.slice((start + length) * 2);
    }
  }
  return "0x" + code;
}

async function check(label, address, artifactPath) {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const live = (await client.getCode({ address })).toLowerCase();
  const expected = expectedCode(artifact, live).toLowerCase();
  const immutables = Object.values(artifact.deployedBytecode.immutableReferences ?? {}).flat().length;
  const same = live === expected;
  console.log(`${label.padEnd(11)} ${address}  ${(live.length - 2) / 2} bytes, ${immutables} immutable slots  ${same ? "MATCHES the Arc Studio build" : "DOES NOT MATCH"}`);
  return same;
}

const results = [
  await check("AjoFactory", deployment.factory, "studio/contracts/out/AjoFactory.sol/AjoFactory.json"),
  await check("AjoCircle", deployment.circle, "studio/contracts/out/AjoCircle.sol/AjoCircle.json"),
];
// The factory's one immutable is the USDC address it was built with.
const usdcWord = pad("0x3600000000000000000000000000000000000000").slice(2).toLowerCase();
console.log("factory USDC immutable is 0x3600...0000:", (await client.getCode({ address: deployment.factory })).toLowerCase().includes(usdcWord));
process.exit(results.every(Boolean) ? 0 : 1);
