import { useReadContract } from 'wagmi';
import { AJO_CIRCLE_ABI, AJO_FACTORY_ABI } from '../abi';

export interface CircleState {
  name: string;
  contribution: bigint;
  roundSeconds: number;
  currentRound: bigint;
  roundStart: bigint;
  roundDeadline: bigint;
  started: boolean;
  finished: boolean;
  members: readonly `0x${string}`[];
  memberJoined: readonly boolean[];
  memberDeposit: readonly bigint[];
  memberMissed: readonly bigint[];
  memberClaimable: readonly bigint[];
  memberShortfall: readonly bigint[];
  roundRecipient: readonly `0x${string}`[];
  roundPot: readonly bigint[];
  roundPaidOut: readonly boolean[];
  roundHasPaid: readonly (readonly boolean[])[];
  roundCovered: readonly (readonly boolean[])[];
}

export function useCircleState(address: `0x${string}` | undefined, chainId: number) {
  const { data, isLoading, error, refetch } = useReadContract({
    address,
    abi: AJO_CIRCLE_ABI,
    functionName: 'circleState',
    chainId,
    query: { enabled: !!address, refetchInterval: 8000 },
  });

  return {
    state: data as CircleState | undefined,
    isLoading,
    error,
    refetch,
  };
}

export function useMyCircles(
  factoryAddress: `0x${string}`,
  walletAddress: `0x${string}` | undefined,
  chainId: number,
) {
  const { data, isLoading, refetch } = useReadContract({
    address: factoryAddress,
    abi: AJO_FACTORY_ABI,
    functionName: 'circlesOf',
    args: walletAddress ? [walletAddress] : undefined,
    chainId,
    query: { enabled: !!walletAddress, refetchInterval: 15000 },
  });

  return {
    circles: (data as `0x${string}`[] | undefined) ?? [],
    isLoading,
    refetch,
  };
}

/** Returns whether `walletAddress` has called join() on `circleAddress`. */
export function useCircleJoined(
  circleAddress: `0x${string}` | undefined,
  walletAddress: `0x${string}` | undefined,
  chainId: number,
) {
  const { data } = useReadContract({
    address: circleAddress,
    abi: [
      {
        type: 'function',
        name: 'joined',
        inputs: [{ name: '', type: 'address' }],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
      },
    ] as const,
    functionName: 'joined',
    args: walletAddress ? [walletAddress] : undefined,
    chainId,
    query: { enabled: !!circleAddress && !!walletAddress, refetchInterval: 15000 },
  });
  return (data) ?? false;
}

export function useCircleCreator(
  factoryAddress: `0x${string}`,
  circleAddress: `0x${string}` | undefined,
  chainId: number,
) {
  const { data } = useReadContract({
    address: factoryAddress,
    abi: AJO_FACTORY_ABI,
    functionName: 'creatorOf',
    args: circleAddress ? [circleAddress] : undefined,
    chainId,
    query: { enabled: !!circleAddress },
  });
  return (data) ?? undefined;
}
