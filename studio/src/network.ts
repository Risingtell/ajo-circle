/**
 * Network configuration for Ajo Circle.
 * Two entries: Arc Mainnet (default) and Arc Testnet.
 * Factory and featured circle addresses are set per network.
 */

export interface NetworkConfig {
  key: string;
  chainId: number;
  name: string;
  label: string; // short display label
  rpc: string;
  explorer: string;
  usdcAddress: `0x${string}`;
  factoryAddress: `0x${string}`;
  featuredCircle?: `0x${string}`;
  isTestnet: boolean;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  arcMainnet: {
    key: 'mainnet',
    chainId: 5042,
    name: 'Arc',
    label: 'Mainnet',
    rpc: 'https://rpc.mainnet.arc.io',
    explorer: 'https://explorer.arc.io',
    usdcAddress: '0x3600000000000000000000000000000000000000',
    factoryAddress: '0x3cbd2d161fba8fcce9a7f56184d9d33b490bf6d9',
    featuredCircle: '0xb3d2D00cc36e555b84CaFC0Cc7Aff07aC1dc19F8',
    isTestnet: false,
  },
  arcTestnet: {
    key: 'testnet',
    chainId: 5042002,
    name: 'Arc Testnet',
    label: 'Testnet',
    rpc: 'https://rpc.testnet.arc.io',
    explorer: 'https://explorer.testnet.arc.io',
    usdcAddress: '0x3600000000000000000000000000000000000000',
    factoryAddress: '0x73766ceb297ecd12d4db2be9baa37c97c5b5b5b0',
    isTestnet: true,
  },
};

// Default: Arc Mainnet
export const DEFAULT_NETWORK = NETWORKS.arcMainnet;

export function getNetwork(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find((n) => n.chainId === chainId);
}

/** Returns the network for a given key ('mainnet' | 'testnet'), falling back to default. */
export function getNetworkByKey(key: string | null | undefined): NetworkConfig {
  return Object.values(NETWORKS).find((n) => n.key === key) ?? DEFAULT_NETWORK;
}

export function explorerTx(chainId: number, hash: string): string {
  const n = getNetwork(chainId);
  const base = n ? n.explorer : DEFAULT_NETWORK.explorer;
  return `${base}/tx/${hash}`;
}

export function explorerAddr(chainId: number, addr: string): string {
  const n = getNetwork(chainId);
  const base = n ? n.explorer : DEFAULT_NETWORK.explorer;
  return `${base}/address/${addr}`;
}
