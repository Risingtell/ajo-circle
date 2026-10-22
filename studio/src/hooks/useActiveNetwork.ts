/**
 * Returns the active NetworkConfig based on the connected wallet's chain,
 * and whether the wallet is on an unsupported chain.
 *
 * Rules:
 *  - Wallet on Arc Mainnet (5042)      -> arcMainnet
 *  - Wallet on Arc Testnet (5042002)   -> arcTestnet
 *  - Wallet on any other chain         -> DEFAULT_NETWORK, but isWrongChain = true
 *  - No wallet connected               -> the network derived from the URL ?network= param,
 *                                         or DEFAULT_NETWORK if absent
 */
import { useAccount } from 'wagmi';
import { getNetwork, getNetworkByKey, DEFAULT_NETWORK, type NetworkConfig } from '../network';

export interface ActiveNetwork {
  network: NetworkConfig;
  /** True when a wallet is connected but on a chain this app does not support. */
  isWrongChain: boolean;
}

export function useActiveNetwork(urlNetworkKey?: string | null): ActiveNetwork {
  const { chainId, isConnected } = useAccount();

  if (isConnected && chainId !== undefined) {
    const matched = getNetwork(chainId);
    if (matched) {
      return { network: matched, isWrongChain: false };
    }
    // Connected to an unsupported chain: show default but flag it
    return { network: DEFAULT_NETWORK, isWrongChain: true };
  }

  // No wallet: use the URL hint, else default
  return { network: getNetworkByKey(urlNetworkKey), isWrongChain: false };
}
