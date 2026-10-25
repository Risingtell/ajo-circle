/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'

// Pre-register chain RPC URLs so trace events show correct chain names immediately.
// Only runs in the preview (DEV); Vite drops this branch from the production bundle.
if (import.meta.env.DEV) {
  void import('./tracing').then(({ registerChain }) => {
    registerChain(arc.id, arc.rpcUrls.default.http[0])
    registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
  })
}

export const config = createConfig({
  chains: [arc, arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arc.id]: http(),
    [arcTestnet.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
