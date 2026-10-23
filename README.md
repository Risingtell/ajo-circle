# Ajo Circle

A rotating savings circle on Arc, paid in USDC.

In an ajo (also called esusu or susu), a small group agrees an amount and a round length. Every round each member pays in, and one member takes the whole pot. The turn rotates until everyone has been paid once. Today a trusted organiser holds the cash. Ajo Circle replaces the organiser with a contract: nobody holds the money, and everyone can see who has paid.

Built in Arc Studio: https://studio.arc.io/app/50208fc9-aa83-4607-9d24-1ea4551f7e59

## Live on Arc mainnet

- App: https://ajo-circle.vercel.app
- Video walkthrough (1:48): https://youtu.be/zZDvz0zarfs
- The first circle, read-only, no wallet needed: https://ajo-circle.vercel.app/?circle=0xb3d2D00cc36e555b84CaFC0Cc7Aff07aC1dc19F8&network=mainnet
- AjoFactory: [0x3cbd2d161fba8fcce9a7f56184d9d33b490bf6d9](https://explorer.arc.io/address/0x3cbd2d161fba8fcce9a7f56184d9d33b490bf6d9)
- First circle: [0xb3d2D00cc36e555b84CaFC0Cc7Aff07aC1dc19F8](https://explorer.arc.io/address/0xb3d2D00cc36e555b84CaFC0Cc7Aff07aC1dc19F8)

The first circle ran its full cycle on mainnet: 3 members, 3 rounds of 0.20 USDC, every pot collected and every deposit returned. 37 of 37 transactions succeeded, 2.4 USDC went into the circle and 2.4 USDC came back out, and the circle now holds 0. Every transaction, with explorer links, is in [EVIDENCE.md](EVIDENCE.md).

## How it works

1. Someone starts a circle with a name, an amount per round, a round length, and the members in payout order.
2. Each member joins by paying one round's amount as a deposit. The circle starts when the last member joins.
3. Every round, each member pays the amount. When everyone has paid, or the round's time is up, anyone can close the round. The pot is then waiting for that round's member, who collects it.
4. If a member misses a round, their deposit covers it and the miss is recorded on chain. A miss with no deposit left to cover it is recorded as owed, and the app shows it.
5. After the last round, each member takes back what is left of their deposit.

There is no admin and no upgrade path. Nobody, including the person who created the circle, can move the money any other way.

## How it was built in Arc Studio

The contracts, the tests and the app were all written in Arc Studio, driven from the Arc Studio CLI over twelve turns. Each prompt is in [studio-prompts/](studio-prompts), in order.

- Studio wrote `AjoCircle` and `AjoFactory`, 46 Foundry tests, deployed every version to Arc testnet, and built the React app.
- Studio's security reviews moved payouts to collect-your-pot (a frozen recipient could otherwise stall a push payout and the whole circle with it), let a deposit cover more than one miss, check that the full amount arrives on every incoming transfer, and check that the USDC address is a contract.
- Reading each turn's changes found the rest, and Studio fixed them:
  - covered payments were being counted as owed
  - anyone could fill someone's circle list, so strangers' circles now sit in a separate Invitations section
  - reads followed the wallet's chain, and a share link took the wallet's network
  - approve raced the payment that needed it
  - a hand-written ABI listed one struct's fields out of order, so circle pages could not load; the app now takes its ABI straight from the compiled contracts
- The contracts on mainnet are Studio's build, byte for byte. `node scripts/verify-bytecode.mjs` checks it.

## Check it yourself

```bash
npm install
node scripts/verify-bytecode.mjs   # mainnet code matches studio/contracts/out
node scripts/evidence.mjs          # re-reads every mainnet transaction from the chain
node scripts/ajo.mjs status        # the circle's full state, read live (no keys needed)
```

The same cycle ran first on Arc testnet, with one member skipping a round so their deposit covered it: `node scripts/verify-bytecode.mjs --testnet` and `node scripts/evidence.mjs --testnet` ([EVIDENCE-testnet.md](EVIDENCE-testnet.md)).

## Run the app

```bash
cd studio
bun install
bun run dev
```

Contract tests: `cd studio && bun install && forge test`. OpenZeppelin comes from `node_modules`, and `forge-std` is in `lib/`.

## Drive a circle from the command line

`scripts/ajo.mjs` is how the mainnet circle was run. Copy `.env.example` to `.env`, fill in three wallets, then:

```bash
node --env-file=.env scripts/ajo.mjs --testnet deploy
node --env-file=.env scripts/ajo.mjs --testnet create "My circle" 0.20 3600
node --env-file=.env scripts/ajo.mjs --testnet fund 1
node --env-file=.env scripts/ajo.mjs --testnet join all
node --env-file=.env scripts/ajo.mjs --testnet pay all
node --env-file=.env scripts/ajo.mjs --testnet payout
node --env-file=.env scripts/ajo.mjs --testnet claim deployer
node --env-file=.env scripts/ajo.mjs --testnet status
```

Drop `--testnet` for Arc mainnet.

## Files

- `studio/contracts/AjoCircle.sol` and `studio/contracts/AjoFactory.sol`: the contracts
- `studio/contracts/test/AjoCircle.t.sol`: the 46 tests
- `studio/src/`: the app (React, wagmi, viem)
- `scripts/`: mainnet deploy and demo, bytecode check, evidence report
- `deployments/`: addresses and every transaction hash, per network

## Security

Not audited by a third party. It went through two Arc Studio security reviews and a line-by-line review of every change. USDC on Arc can be frozen by its issuer, as on any chain; payouts are collected rather than pushed, so one frozen member cannot stop the others getting their pots.

## License

MIT
