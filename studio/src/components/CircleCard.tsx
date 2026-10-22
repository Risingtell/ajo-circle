import React from 'react';
import { useReadContract } from 'wagmi';
import { AJO_CIRCLE_ABI } from '../abi';
import { formatUsdc, formatCountdown } from '../utils';

interface CircleCardProps {
  address: `0x${string}`;
  chainId: number;
  onClick: () => void;
}

export function CircleCard({ address, chainId, onClick }: CircleCardProps) {
  const { data } = useReadContract({
    address,
    abi: AJO_CIRCLE_ABI,
    functionName: 'circleState',
    chainId,
    query: { refetchInterval: 15000 },
  });

  const glass: React.CSSProperties = {
    background: 'rgba(255,255,255,0.64)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  };

  if (!data) {
    return (
      <button onClick={onClick} className="w-full text-left rounded-2xl p-4 animate-pulse" style={glass}>
        <div className="h-4 w-1/2 rounded bg-slate-200 mb-2" />
        <div className="h-3 w-1/3 rounded bg-slate-100" />
      </button>
    );
  }

  const state = data;
  const memberCount = state.members.length;
  const roundDeadline = Number(state.roundDeadline);
  const pot = state.contribution * BigInt(memberCount);
  const paidCount = state.roundHasPaid[Number(state.currentRound)]?.filter(Boolean).length ?? 0;

  let statusLabel = '';
  let statusColor = 'var(--muted)';
  if (!state.started) {
    const joinedCount = state.memberJoined.filter(Boolean).length;
    statusLabel = `Waiting for members (${joinedCount}/${memberCount} joined)`;
    statusColor = 'var(--accent-hover)';
  } else if (state.finished) {
    statusLabel = 'Finished';
    statusColor = 'var(--success)';
  } else {
    const countdown = formatCountdown(roundDeadline);
    statusLabel = countdown === 'Closed' ? 'Ready to pay out' : `Round ${Number(state.currentRound) + 1}/${memberCount} closes in ${countdown}`;
    statusColor = countdown === 'Closed' ? 'var(--success)' : 'var(--ink-2)';
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl p-4 space-y-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={glass}
    >
      <div className="flex items-start justify-between">
        <span className="display text-sm font-bold" style={{ color: 'var(--ink)' }}>{state.name}</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--success)' }}>
          {formatUsdc(pot)} USDC
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: statusColor }}>{statusLabel}</span>
      </div>
      {state.started && !state.finished && (
        <div className="flex items-center gap-1">
          {state.memberJoined.map((_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: state.roundHasPaid[Number(state.currentRound)]?.[i]
                  ? 'var(--success)'
                  : 'var(--border)',
              }}
            />
          ))}
          <span className="text-xs ml-1 tabular-nums" style={{ color: 'var(--subtle)' }}>
            {paidCount}/{memberCount}
          </span>
        </div>
      )}
    </button>
  );
}
