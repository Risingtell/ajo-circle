import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { erc20Abi, createPublicClient, http } from 'viem';
import { AJO_CIRCLE_ABI } from '../abi';
import { NETWORKS } from '../network';

/** Build a viem public client for a given chain ID using our known RPC URLs. */
function publicClientForChain(chainId: number) {
  const entry = Object.values(NETWORKS).find((n) => n.chainId === chainId);
  const rpcUrl = entry?.rpc;
  // We need a viem chain object; build a minimal one.
  return createPublicClient({
    transport: http(rpcUrl),
    chain: { id: chainId, name: entry?.name ?? 'Arc', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, rpcUrls: { default: { http: [rpcUrl ?? ''] } } },
  });
}

export type ApproveStep = 'idle' | 'approving' | 'waiting-approval' | 'submitting' | 'confirming';

function stepLabel(step: ApproveStep, actionLabel: string): string {
  switch (step) {
    case 'approving': return 'Approving USDC (1 of 2)...';
    case 'waiting-approval': return 'Waiting for approval (1 of 2)...';
    case 'submitting': return `${actionLabel} (2 of 2)...`;
    case 'confirming': return 'Confirming...';
    default: return '';
  }
}

export function useApproveAndJoin(
  circleAddress: `0x${string}`,
  usdcAddress: `0x${string}`,
  contribution: bigint,
  walletChainId: number | undefined,
  targetChainId: number,
) {
  const { switchChain } = useSwitchChain();
  const { writeContractAsync: approveWrite } = useWriteContract();
  const {
    writeContract: joinWrite,
    data: joinHash,
    isPending: joinPending,
    reset: joinReset,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: joinHash });
  const [step, setStep] = useState<ApproveStep>('idle');

  const execute = async (walletAddress: `0x${string}`) => {
    if (walletChainId !== targetChainId) {
      switchChain({ chainId: targetChainId });
      return;
    }
    try {
      const client = publicClientForChain(targetChainId);
      // Check existing allowance
      const allowance = await client.readContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [walletAddress, circleAddress],
      });

      if (allowance < contribution) {
        setStep('approving');
        const approveHash = await approveWrite({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [circleAddress, contribution],
        });
        setStep('waiting-approval');
        await client.waitForTransactionReceipt({ hash: approveHash });
      }

      setStep('submitting');
      joinWrite({
        address: circleAddress,
        abi: AJO_CIRCLE_ABI,
        functionName: 'join',
      });
    } finally {
      setStep('idle');
    }
  };

  const stepHint = stepLabel(step, 'Joining');

  return {
    execute,
    hash: joinHash,
    isPending: joinPending || step !== 'idle',
    isConfirming,
    isSuccess,
    reset: joinReset,
    stepHint,
  };
}

export function useApproveAndContribute(
  circleAddress: `0x${string}`,
  usdcAddress: `0x${string}`,
  contribution: bigint,
  round: bigint,
  walletChainId: number | undefined,
  targetChainId: number,
) {
  const { switchChain } = useSwitchChain();
  const { writeContractAsync: approveWrite } = useWriteContract();
  const {
    writeContract: contributeWrite,
    data: contributeHash,
    isPending,
    reset,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: contributeHash });
  const [step, setStep] = useState<ApproveStep>('idle');

  const execute = async (walletAddress: `0x${string}`) => {
    if (walletChainId !== targetChainId) {
      switchChain({ chainId: targetChainId });
      return;
    }
    try {
      const client = publicClientForChain(targetChainId);
      const allowance = await client.readContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [walletAddress, circleAddress],
      });

      if (allowance < contribution) {
        setStep('approving');
        const approveHash = await approveWrite({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [circleAddress, contribution],
        });
        setStep('waiting-approval');
        await client.waitForTransactionReceipt({ hash: approveHash });
      }

      setStep('submitting');
      contributeWrite({
        address: circleAddress,
        abi: AJO_CIRCLE_ABI,
        functionName: 'contribute',
        args: [round],
      });
    } finally {
      setStep('idle');
    }
  };

  const stepHint = stepLabel(step, 'Paying');

  return {
    execute,
    hash: contributeHash,
    isPending: isPending || step !== 'idle',
    isConfirming,
    isSuccess,
    reset,
    stepHint,
  };
}

export function usePayout(
  circleAddress: `0x${string}`,
  walletChainId: number | undefined,
  targetChainId: number,
) {
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const execute = () => {
    if (walletChainId !== targetChainId) { switchChain({ chainId: targetChainId }); return; }
    writeContract({ address: circleAddress, abi: AJO_CIRCLE_ABI, functionName: 'payout' });
  };

  return { execute, hash, isPending, isConfirming, isSuccess, reset };
}

export function useClaim(
  circleAddress: `0x${string}`,
  walletChainId: number | undefined,
  targetChainId: number,
) {
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const execute = () => {
    if (walletChainId !== targetChainId) { switchChain({ chainId: targetChainId }); return; }
    writeContract({ address: circleAddress, abi: AJO_CIRCLE_ABI, functionName: 'claim' });
  };

  return { execute, hash, isPending, isConfirming, isSuccess, reset };
}

export function useWithdrawDeposit(
  circleAddress: `0x${string}`,
  walletChainId: number | undefined,
  targetChainId: number,
) {
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const execute = () => {
    if (walletChainId !== targetChainId) { switchChain({ chainId: targetChainId }); return; }
    writeContract({ address: circleAddress, abi: AJO_CIRCLE_ABI, functionName: 'withdrawDeposit' });
  };

  return { execute, hash, isPending, isConfirming, isSuccess, reset };
}

export function useCreateCircle(
  factoryAddress: `0x${string}`,
  walletChainId: number | undefined,
  targetChainId: number,
) {
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, reset, isError, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const execute = (
    name: string,
    members: `0x${string}`[],
    contribution: bigint,
    roundSeconds: number,
  ) => {
    if (walletChainId !== targetChainId) { switchChain({ chainId: targetChainId }); return; }
    writeContract({
      address: factoryAddress,
      abi: [
        {
          type: 'function',
          name: 'createCircle',
          inputs: [
            { name: 'circleName', type: 'string' },
            { name: 'members_', type: 'address[]' },
            { name: 'contribution_', type: 'uint256' },
            { name: 'roundSeconds_', type: 'uint64' },
          ],
          outputs: [{ name: '', type: 'address' }],
          stateMutability: 'nonpayable',
        },
      ] as const,
      functionName: 'createCircle',
      args: [name, members, contribution, BigInt(roundSeconds)],
    });
  };

  return { execute, hash, isPending, isConfirming, isSuccess, reset, isError, error };
}
