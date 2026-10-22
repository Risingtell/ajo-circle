// Deploys the Arc Studio build of AjoFactory and drives a circle from the command line.
// The bytecode comes unchanged from studio/contracts/out, which Arc Studio compiled and tested.
//
// Usage: node --env-file=.env scripts/ajo.mjs [--testnet] <command> [args]
//   deploy                          deploy AjoFactory with the studio artifact
//   create <name> <usdc> <seconds>  create a circle: deployer, member A, member B, in that payout order
//   fund <usdc>                     send <usdc> from the deployer to members A and B
//   join | pay | claim | withdraw <deployer|a|b|all>
//   payout                          close the current round (anyone may call it)
//   status                          balances and the whole circle state
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, formatUnits, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const argv = process.argv.slice(2);
const testnet = argv.includes("--testnet");
const [cmd, ...args] = argv.filter((a) => a !== "--testnet");

const chain = testnet
  ? defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } } })
  : defineChain({ id: 5042, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } } });
const EXPLORER = testnet ? "https://explorer.testnet.arc.io" : "https://explorer.arc.io";
const USDC = "0x3600000000000000000000000000000000000000";
// Arc's mempool rejects a maxFeePerGas under 20 gwei.
const FEES = { maxFeePerGas: 40_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n };
const STATE_FILE = `deployments/${testnet ? "testnet" : "mainnet"}.json`;

const factoryArtifact = JSON.parse(readFileSync("studio/contracts/out/AjoFactory.sol/AjoFactory.json", "utf8"));
const circleAbi = JSON.parse(readFileSync("studio/contracts/out/AjoCircle.sol/AjoCircle.json", "utf8")).abi;
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function transfer(address,uint256) returns (bool)"]);

const wallets = {
  deployer: privateKeyToAccount(process.env.AJO_DEPLOYER_KEY),
  a: privateKeyToAccount(process.env.AJO_MEMBER_A_KEY),
  b: privateKeyToAccount(process.env.AJO_MEMBER_B_KEY),
};
const pc = createPublicClient({ chain, transport: http() });
const walletOf = (name) => createWalletClient({ account: wallets[name], chain, transport: http() });

const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
const save = () => { mkdirSync("deployments", { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); };
const usd = (v) => formatUnits(v, 6);
const balance = (address) => pc.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [address] });
const who = (sel) => (sel === "all" ? Object.keys(wallets) : [sel]).map((n) => { if (!wallets[n]) throw new Error(`unknown member ${n}`); return n; });

async function send(name, label, request) {
  const hash = await walletOf(name).writeContract({ ...request, ...FEES });
  const receipt = await pc.waitForTransactionReceipt({ hash });
  console.log(`${label.padEnd(28)} ${receipt.status.padEnd(8)} ${EXPLORER}/tx/${hash}`);
  if (receipt.status !== "success") process.exit(1);
  state.txs = [...(state.txs ?? []), { label, from: wallets[name].address, hash, at: new Date().toISOString() }];
  save();
  return receipt;
}

const circle = () => {
  if (!state.circle) throw new Error("no circle yet: run create");
  return state.circle;
};
const readCircle = (functionName, a = []) => pc.readContract({ address: circle(), abi: circleAbi, functionName, args: a });

switch (cmd) {
  case "deploy": {
    if (state.factory) throw new Error(`factory already deployed at ${state.factory}`);
    const hash = await walletOf("deployer").deployContract({ abi: factoryArtifact.abi, bytecode: factoryArtifact.bytecode.object, args: [USDC], ...FEES });
    const receipt = await pc.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`deploy reverted ${hash}`);
    state.factory = receipt.contractAddress;
    state.factoryTx = hash;
    save();
    console.log("AjoFactory", state.factory, `${EXPLORER}/address/${state.factory}`);
    console.log("tx", `${EXPLORER}/tx/${hash}`, "gas", receipt.gasUsed);
    break;
  }
  case "create": {
    const [name, amount, seconds] = args;
    const members = [wallets.deployer.address, wallets.a.address, wallets.b.address];
    const request = { address: state.factory, abi: factoryArtifact.abi, functionName: "createCircle", args: [name, members, parseUnits(amount, 6), BigInt(seconds)] };
    const { result } = await pc.simulateContract({ ...request, account: wallets.deployer });
    await send("deployer", `create "${name}"`, request);
    state.circle = result;
    save();
    console.log("AjoCircle", result, `${EXPLORER}/address/${result}`);
    break;
  }
  case "fund": {
    const amount = parseUnits(args[0], 6);
    for (const n of ["a", "b"]) await send("deployer", `fund member ${n}`, { address: USDC, abi: erc20, functionName: "transfer", args: [wallets[n].address, amount] });
    break;
  }
  case "join":
  case "pay": {
    const amount = await readCircle("contribution");
    for (const n of who(args[0] ?? "all")) {
      await send(n, `${n} approve`, { address: USDC, abi: erc20, functionName: "approve", args: [circle(), amount] });
      if (cmd === "join") await send(n, `${n} join`, { address: circle(), abi: circleAbi, functionName: "join" });
      else await send(n, `${n} pay round ${await readCircle("currentRound")}`, { address: circle(), abi: circleAbi, functionName: "contribute", args: [await readCircle("currentRound")] });
    }
    break;
  }
  case "payout":
    await send("deployer", `payout round ${await readCircle("currentRound")}`, { address: circle(), abi: circleAbi, functionName: "payout" });
    break;
  case "claim":
  case "withdraw":
    for (const n of who(args[0] ?? "all")) {
      await send(n, `${n} ${cmd}`, { address: circle(), abi: circleAbi, functionName: cmd === "claim" ? "claim" : "withdrawDeposit" });
    }
    break;
  case "status": {
    for (const [n, acct] of Object.entries(wallets)) console.log(n.padEnd(9), acct.address, usd(await balance(acct.address)), "USDC");
    if (state.factory) console.log("factory  ", state.factory);
    if (state.circle) {
      const s = await readCircle("circleState");
      console.log("circle   ", state.circle, `"${s.name}"`, "| contribution", usd(s.contribution), "| round", s.currentRound, "| started", s.started, "| finished", s.finished, "| holds", usd(await balance(state.circle)));
      s.members.forEach((m, i) => console.log("  member", i, m, "joined", s.memberJoined[i], "deposit", usd(s.memberDeposit[i]), "claimable", usd(s.memberClaimable[i]), "missed", s.memberMissed[i]));
      s.roundRecipient.forEach((r, i) => console.log("  round ", i, "recipient", r, "pot", usd(s.roundPot[i]), "paid out", s.roundPaidOut[i], "paid by", s.roundHasPaid[i].map((p) => (p ? 1 : 0)).join("")));
    }
    break;
  }
  default:
    console.log("commands: deploy create fund join pay payout claim withdraw status (add --testnet for Arc testnet)");
}
