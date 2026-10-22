import React from 'react';
import { useReadContract } from 'wagmi';
import { AJO_CIRCLE_ABI } from '../abi';
import { formatUsdc, formatAddress } from '../utils';
import { Users } from 'lucide-react';

interface Props {
  address: `0x${string}`;
  chainId: number;
  creator: `0x${string}` | undefined;
  onClick: () => void;
}

const glassInner: React.CSSProperties = {
  background: 'rgba(255,255,255,0.46)',
  border: '1px solid rgba(255,255,255,0.56)',
};

export function InvitationCard({ address, chainId, creator, onClick }: Props) {
  const { data } = useReadContract({
    address,
    abi: AJO_CIRCLE_ABI,
    functionName: 'circleState',
    chainId,
    query: { enabled: true, refetchInterval: false },
  });

  if (!data) {
    return (
      <div className="rounded-2xl p-4 animate-pulse" style={glassInner}>
        <div className="h-4 w-1/2 rounded bg-slate-200" />
      </div>
    );
  }

  const state = data as {
    name: string;
    contribution: bigint;
    members: readonly `0x${string}`[];
  };

  const memberCount = state.members.length;

  return (
    <div
      className="rounded-2xl p-4 cursor-pointer hover:scale-[1.005] transition-transform"
      style={{
        background: 'rgba(255,255,255,0.46)',
        border: '1px solid rgba(133,177,237,0.35)',
      }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{state.name}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {formatUsdc(state.contribution)} USDC per round, {memberCount} members
          </p>
          {creator && (
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
              Created by {formatAddress(creator)}
            </p>
          )}
        </div>
        <div
          className="flex-shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: 'rgba(133,177,237,0.15)', color: '#1061a6', border: '1px solid rgba(133,177,237,0.35)' }}
        >
          <Users className="size-3" />
          Invited
        </div>
      </div>
      <p className="text-xs mt-2 font-medium" style={{ color: 'var(--accent-hover)' }}>
        Tap to view and join
      </p>
    </div>
  );
}
