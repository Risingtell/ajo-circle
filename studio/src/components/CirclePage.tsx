import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { ArrowLeft, Copy, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useCircleState } from '../hooks/useCircleState';
import {
  useApproveAndJoin,
  useApproveAndContribute,
  usePayout,
  useClaim,
  useWithdrawDeposit,
} from '../hooks/useCircleActions';
import { ActionButton } from './ActionButton';
import { TxLink, AddrLink } from './TxLink';
import { NetworkBadge } from './NetworkBadge';
import { ConnectKitButton } from 'connectkit';
import { type NetworkConfig, explorerAddr } from '../network';
import { formatUsdc, formatAddress, formatCountdown, parseOnchainError, formatRoundLengthWords } from '../utils';

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.64)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.68)',
  boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
};

const glassInner: React.CSSProperties = {
  background: 'rgba(255,255,255,0.46)',
  border: '1px solid rgba(255,255,255,0.56)',
};

interface Props {
  circleAddress: `0x${string}`;
  /** The network this circle lives on. Always derived from URL or the home list's network,
   *  never from the wallet's current chain. Reads and explorer links always use this. */
  network: NetworkConfig;
  onBack: () => void;
}

function useCountdown(deadline: number) {
  const [display, setDisplay] = useState(() => formatCountdown(deadline));
  useEffect(() => {
    const id = setInterval(() => setDisplay(formatCountdown(deadline)), 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return display;
}

export function CirclePage({ circleAddress, network, onBack }: Props) {
  const { address: walletAddress, chainId: walletChainId, isConnected } = useAccount();

  // Fix 1: reads always use the circle's network, never the wallet's chain.
  const { state, isLoading, error: readError, refetch } = useCircleState(circleAddress, network.chainId);
  const [lastTx, setLastTx] = useState<{ hash: `0x${string}`; label: string } | undefined>();
  const [copied, setCopied] = useState(false);

  const deadline = Number(state?.roundDeadline ?? 0);
  const countdown = useCountdown(deadline);

  const memberIndex = state
    ? state.members.findIndex((m) => m.toLowerCase() === walletAddress?.toLowerCase())
    : -1;
  const isMember = memberIndex >= 0;
  const hasJoined = isMember && (state?.memberJoined[memberIndex] ?? false);
  const currentRound = Number(state?.currentRound ?? 0);
  const hasPaidThisRound = isMember && (state?.roundHasPaid[currentRound]?.[memberIndex] ?? false);
  const myClaimable = isMember ? (state?.memberClaimable[memberIndex] ?? 0n) : 0n;
  const myDeposit = isMember ? (state?.memberDeposit[memberIndex] ?? 0n) : 0n;

  // Fix 2: wallet is on wrong chain when connected but not on the circle's network.
  const walletOnWrongChain = isConnected && walletChainId !== network.chainId;

  // All write actions — targetChainId is always the circle's network.
  const joinAction = useApproveAndJoin(
    circleAddress,
    network.usdcAddress,
    state?.contribution ?? 0n,
    walletChainId,
    network.chainId,
  );
  const contributeAction = useApproveAndContribute(
    circleAddress,
    network.usdcAddress,
    state?.contribution ?? 0n,
    BigInt(currentRound),
    walletChainId,
    network.chainId,
  );
  const payoutAction = usePayout(circleAddress, walletChainId, network.chainId);
  const claimAction = useClaim(circleAddress, walletChainId, network.chainId);
  const withdrawAction = useWithdrawDeposit(circleAddress, walletChainId, network.chainId);

  // Track previous hashes to fire toast only once per new tx
  const prevJoinHash = useRef<string | undefined>();
  const prevContributeHash = useRef<string | undefined>();
  const prevPayoutHash = useRef<string | undefined>();
  const prevClaimHash = useRef<string | undefined>();
  const prevWithdrawHash = useRef<string | undefined>();

  const handleSuccess = useCallback(
    (hash: `0x${string}`, label: string) => {
      setLastTx({ hash, label });
      toast.success(label);
      const timer = window.setTimeout(() => { void refetch(); }, 2000);
      return () => window.clearTimeout(timer);
    },
    [refetch],
  );

  useEffect(() => {
    if (joinAction.isSuccess && joinAction.hash && joinAction.hash !== prevJoinHash.current) {
      prevJoinHash.current = joinAction.hash;
      handleSuccess(joinAction.hash, 'Joined the circle!');
    }
  }, [joinAction.isSuccess, joinAction.hash, handleSuccess]);
  useEffect(() => {
    if (contributeAction.isSuccess && contributeAction.hash && contributeAction.hash !== prevContributeHash.current) {
      prevContributeHash.current = contributeAction.hash;
      handleSuccess(contributeAction.hash, 'Payment sent!');
    }
  }, [contributeAction.isSuccess, contributeAction.hash, handleSuccess]);
  useEffect(() => {
    if (payoutAction.isSuccess && payoutAction.hash && payoutAction.hash !== prevPayoutHash.current) {
      prevPayoutHash.current = payoutAction.hash;
      handleSuccess(payoutAction.hash, 'Round paid out!');
    }
  }, [payoutAction.isSuccess, payoutAction.hash, handleSuccess]);
  useEffect(() => {
    if (claimAction.isSuccess && claimAction.hash && claimAction.hash !== prevClaimHash.current) {
      prevClaimHash.current = claimAction.hash;
      handleSuccess(claimAction.hash, 'Pot collected!');
    }
  }, [claimAction.isSuccess, claimAction.hash, handleSuccess]);
  useEffect(() => {
    if (withdrawAction.isSuccess && withdrawAction.hash && withdrawAction.hash !== prevWithdrawHash.current) {
      prevWithdrawHash.current = withdrawAction.hash;
      handleSuccess(withdrawAction.hash, 'Deposit returned!');
    }
  }, [withdrawAction.isSuccess, withdrawAction.hash, handleSuccess]);

  const handleCopyLink = () => {
    const params = new URLSearchParams({ circle: circleAddress, network: network.key });
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Show skeleton only while the first load is in flight.
  if (isLoading && !state) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-slate-200" />
          <div className="h-6 w-1/2 rounded bg-slate-200" />
        </div>
        <div className="h-32 rounded-3xl bg-slate-100" />
        <div className="h-20 rounded-2xl bg-slate-100" />
      </div>
    );
  }

  // Show a readable error instead of an endless skeleton when the read fails.
  if (readError || !state) {
    console.error('[CirclePage] circleState read failed:', readError);
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium hover:opacity-60 transition-opacity" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="size-4" /> Back
        </button>
        <div
          className="rounded-3xl p-6 text-center space-y-3"
          style={{ background: 'rgba(255,255,255,0.64)', border: '1px solid rgba(186,43,76,0.25)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
            Could not load this circle.
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Check that the address is correct and you are on the right network ({network.name}).
          </p>
          {readError && (
            <p className="text-xs font-mono break-all" style={{ color: 'var(--subtle)' }}>
              {(readError as { shortMessage?: string }).shortMessage ?? readError.message}
            </p>
          )}
          <button
            onClick={() => { void refetch(); }}
            className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-70"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const memberCount = state.members.length;
  const pot = state.contribution * BigInt(memberCount);
  const paidCount = state.roundHasPaid[currentRound]?.filter(Boolean).length ?? 0;
  const deadlinePassed = deadline > 0 && countdown === 'Closed';
  const canPayout = state.started && !state.finished && (paidCount === memberCount || deadlinePassed);

  // Fix 2: switch button label names the exact network.
  const switchNetworkLabel = `Switch to ${network.name}`;

  type ActionKind = 'connect' | 'wrong-chain' | 'join' | 'pay' | 'payout' | 'claim' | 'withdraw' | 'none';
  let primaryAction: ActionKind = 'none';
  if (!isConnected) primaryAction = 'connect';
  else if (walletOnWrongChain) primaryAction = 'wrong-chain';
  else if (isMember && !state.started && !hasJoined) primaryAction = 'join';
  else if (state.started && !state.finished && isMember && hasJoined && !hasPaidThisRound) primaryAction = 'pay';
  else if (canPayout) primaryAction = 'payout';
  else if (myClaimable > 0n) primaryAction = 'claim';
  else if (state.finished && isMember && myDeposit > 0n) primaryAction = 'withdraw';

  const renderPrimaryAction = () => {
    const usdcAmt = (n: bigint) => `${formatUsdc(n)} USDC`;

    switch (primaryAction) {
      case 'connect':
        return (
          <div className="rounded-2xl p-4 text-center space-y-2" style={glassInner}>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Connect a wallet to join or pay</p>
            <div className="flex justify-center">
              <ConnectKitButton />
            </div>
          </div>
        );
      // Fix 2: dedicated wrong-chain action.
      case 'wrong-chain':
        return (
          <ActionButton
            label={switchNetworkLabel}
            sublabel={`Your wallet is on a different network`}
            onClick={() => {
              payoutAction.execute(); // reuses the switchChain logic inside (walletChainId !== targetChainId branch)
            }}
            isPending={false}
            isConfirming={false}
          />
        );
      case 'join':
        return (
          <ActionButton
            label={joinAction.stepHint || 'Join this circle'}
            sublabel={joinAction.stepHint ? undefined : `Security deposit: ${usdcAmt(state.contribution)}`}
            onClick={() => {
              void joinAction.execute(walletAddress!).catch((e: unknown) => toast.error(parseOnchainError(e)));
            }}
            isPending={joinAction.isPending}
            isConfirming={joinAction.isConfirming}
          />
        );
      case 'pay':
        return (
          <ActionButton
            label={contributeAction.stepHint || 'Pay this round'}
            sublabel={contributeAction.stepHint ? undefined : usdcAmt(state.contribution)}
            onClick={() => {
              void contributeAction.execute(walletAddress!).catch((e: unknown) => toast.error(parseOnchainError(e)));
            }}
            isPending={contributeAction.isPending}
            isConfirming={contributeAction.isConfirming}
          />
        );
      case 'payout':
        return (
          <ActionButton
            label={`Pay out round ${currentRound + 1}`}
            sublabel={`${usdcAmt(pot)} to ${formatAddress(state.members[currentRound])}`}
            onClick={() => { payoutAction.execute(); }}
            isPending={payoutAction.isPending}
            isConfirming={payoutAction.isConfirming}
          />
        );
      case 'claim':
        return (
          <ActionButton
            label="Collect your pot"
            sublabel={usdcAmt(myClaimable)}
            onClick={() => { claimAction.execute(); }}
            isPending={claimAction.isPending}
            isConfirming={claimAction.isConfirming}
          />
        );
      case 'withdraw':
        return (
          <ActionButton
            label="Take back deposit"
            sublabel={usdcAmt(myDeposit)}
            onClick={() => { withdrawAction.execute(); }}
            isPending={withdrawAction.isPending}
            isConfirming={withdrawAction.isConfirming}
          />
        );
      default:
        return null;
    }
  };

  const paymentStatus = (round: number, mi: number): { label: string; color: string; bg: string } => {
    if (state.roundPaidOut[round]) {
      if (state.roundHasPaid[round]?.[mi]) {
        if (state.roundCovered[round]?.[mi]) {
          return { label: 'Covered', color: '#b45309', bg: 'rgba(180,83,9,0.08)' };
        }
        return { label: 'Paid', color: 'var(--success)', bg: 'rgba(26,128,71,0.08)' };
      }
      return { label: 'Missed', color: 'var(--danger)', bg: 'rgba(186,43,76,0.08)' };
    }
    if (round < currentRound) {
      if (state.roundHasPaid[round]?.[mi]) return { label: 'Paid', color: 'var(--success)', bg: 'rgba(26,128,71,0.08)' };
      return { label: 'Missed', color: 'var(--danger)', bg: 'rgba(186,43,76,0.08)' };
    }
    if (round === currentRound) {
      if (state.roundHasPaid[round]?.[mi]) return { label: 'Paid', color: 'var(--success)', bg: 'rgba(26,128,71,0.08)' };
      return { label: 'Not yet', color: 'var(--subtle)', bg: 'var(--surface-muted)' };
    }
    return { label: '', color: 'var(--subtle)', bg: 'transparent' };
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl transition-opacity hover:opacity-60" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="display text-xl font-bold break-words" style={{ color: 'var(--ink)' }}>{state.name}</h1>
            <NetworkBadge network={network} />
          </div>
          {/* Circle terms in plain words */}
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {formatUsdc(state.contribution)} USDC per round,{' '}
            {formatRoundLengthWords(Number(state.roundSeconds))},{' '}
            {memberCount} members, pot {formatUsdc(state.contribution * BigInt(memberCount))} USDC
          </p>
          <AddrLink address={circleAddress} chainId={network.chainId} label={`${circleAddress.slice(0, 10)}...`} />
        </div>
        <button
          onClick={handleCopyLink}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:opacity-70"
          style={{ background: 'rgba(255,255,255,0.64)', border: '1px solid var(--border)', color: copied ? 'var(--success)' : 'var(--muted)' }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      {/* Hero card */}
      <div className="rounded-3xl p-5 space-y-3" style={glass}>
        {!state.started ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Waiting to start</p>
            <p className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {state.memberJoined.filter(Boolean).length}/{memberCount} joined
            </p>
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              The circle starts when all {memberCount} members have paid their deposit.
            </p>
          </>
        ) : state.finished ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--success)' }}>Circle finished</p>
            <p className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>All {memberCount} rounds complete</p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                Round {currentRound + 1} of {memberCount}
              </p>
              <span className="text-xs tabular-nums font-medium" style={{ color: countdown === 'Closed' ? 'var(--danger)' : 'var(--ink-2)' }}>
                {countdown === 'Closed' ? 'Round closed' : `Closes in ${countdown}`}
              </span>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>This round goes to</p>
              <p className="display text-lg font-bold mt-0.5" style={{ color: 'var(--ink)' }}>
                {isConnected && state.members[currentRound] === walletAddress
                  ? 'You'
                  : formatAddress(state.members[currentRound])}
              </p>
            </div>
            <div className="rounded-2xl p-3" style={{ background: 'rgba(26,128,71,0.07)', border: '1px solid rgba(26,128,71,0.12)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Pot this round</p>
              <p className="display text-2xl font-bold tabular-nums mt-0.5" style={{ color: 'var(--success)' }}>
                {formatUsdc(pot)} USDC
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Contributions in</p>
                <span className="text-xs tabular-nums font-medium" style={{ color: 'var(--ink-2)' }}>{paidCount}/{memberCount}</span>
              </div>
              <div className="flex gap-1">
                {state.members.map((_, i) => (
                  <div
                    key={i}
                    className="h-1.5 flex-1 rounded-full transition-colors"
                    style={{ background: state.roundHasPaid[currentRound]?.[i] ? 'var(--success)' : 'var(--border)' }}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Primary action */}
      {renderPrimaryAction()}

      {/* Last tx receipt */}
      {lastTx && (
        <div className="rounded-2xl p-3 text-center" style={glassInner}>
          {/* Fix 1: explorer link uses network.chainId */}
          <TxLink hash={lastTx.hash} chainId={network.chainId} label={`${lastTx.label} View transaction`} />
        </div>
      )}

      {/* Members section */}
      <div className="rounded-3xl p-5 space-y-3" style={glass}>
        <p className="display text-sm font-bold" style={{ color: 'var(--ink)' }}>Members</p>

        {/* ── Mobile cards (below sm) ──────────────────────────────────────────── */}
        <div className="sm:hidden space-y-2">
          {state.members.map((member, mi) => {
            const isMe = isConnected && member.toLowerCase() === walletAddress?.toLowerCase();
            const dep = state.memberDeposit[mi];
            const depositLabel = (() => {
              if (!state.finished) return formatUsdc(dep);
              if (dep > 0n) return `${formatUsdc(dep)} to take back`;
              const coveredRound = state.roundCovered.findIndex((rc) => rc[mi]);
              if (coveredRound >= 0) return `Used for R${coveredRound + 1}`;
              return 'Returned';
            })();
            const depositColor = (() => {
              if (!state.finished || dep > 0n) return 'var(--ink-2)';
              const coveredRound = state.roundCovered.findIndex((rc) => rc[mi]);
              if (coveredRound >= 0) return '#b45309';
              return 'var(--success)';
            })();
            return (
              <div
                key={mi}
                className="rounded-2xl px-3 py-2.5 space-y-1.5"
                style={{
                  background: isMe ? 'rgba(133,177,237,0.09)' : 'rgba(255,255,255,0.46)',
                  border: '1px solid rgba(255,255,255,0.56)',
                }}
              >
                {/* Row 1: number, address, deposit */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: 'var(--subtle)' }}>{mi + 1}</span>
                    <a
                      href={explorerAddr(network.chainId, member)}
                      target="_blank"
                      rel="noreferrer"
                      className="mono text-xs hover:underline truncate"
                      style={{ color: isMe ? 'var(--accent-hover)' : 'var(--ink-2)' }}
                    >
                      {isMe ? 'You' : formatAddress(member)}
                    </a>
                    {!state.memberJoined[mi] && (
                      <span className="text-xs shrink-0" style={{ color: 'var(--subtle)' }}>not joined</span>
                    )}
                  </div>
                  <span className="text-xs shrink-0" style={{ color: depositColor }}>{depositLabel}</span>
                </div>
                {/* Row 2: one chip per round */}
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: memberCount }).map((_, r) => {
                    const st = paymentStatus(r, mi);
                    return (
                      <span
                        key={r}
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ color: st.label ? st.color : 'var(--subtle)', background: st.label ? st.bg : 'transparent' }}
                      >
                        R{r + 1}{st.label ? ` ${st.label}` : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Desktop table (sm and above) ────────────────────────────────────── */}
        <div className="hidden sm:block overflow-x-auto -mx-2">
          <table className="w-full text-xs sm:min-w-max lg:min-w-0 lg:table-fixed">
            <colgroup>
              <col className="w-6" />
              <col style={{ minWidth: '7rem' }} className="lg:w-[22%]" />
              <col className="w-12" />
              <col className="w-20" />
              {Array.from({ length: memberCount }).map((_, r) => (
                <col key={r} className="w-16" />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="text-left pb-2 px-2 font-semibold" style={{ color: 'var(--muted)' }}>#</th>
                <th className="text-left pb-2 px-2 font-semibold" style={{ color: 'var(--muted)' }}>Member</th>
                <th className="text-center pb-2 px-2 font-semibold" style={{ color: 'var(--muted)' }}>Joined</th>
                <th className="text-right pb-2 px-2 font-semibold" style={{ color: 'var(--muted)' }}>Deposit</th>
                {Array.from({ length: memberCount }).map((_, r) => (
                  <th key={r} className="text-center pb-2 px-2 font-semibold" style={{ color: 'var(--muted)' }}>
                    R{r + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.members.map((member, mi) => {
                const isMe = isConnected && member.toLowerCase() === walletAddress?.toLowerCase();
                return (
                  <tr
                    key={mi}
                    className="border-t"
                    style={{ borderColor: 'var(--border)', background: isMe ? 'rgba(133,177,237,0.07)' : 'transparent' }}
                  >
                    <td className="py-2 px-2 font-semibold tabular-nums" style={{ color: 'var(--subtle)' }}>{mi + 1}</td>
                    <td className="py-2 px-2">
                      <a
                        href={explorerAddr(network.chainId, member)}
                        target="_blank"
                        rel="noreferrer"
                        className="mono hover:underline"
                        style={{ color: isMe ? 'var(--accent-hover)' : 'var(--ink-2)' }}
                      >
                        {isMe ? 'You' : formatAddress(member)}
                      </a>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span style={{ color: state.memberJoined[mi] ? 'var(--success)' : 'var(--subtle)' }}>
                        {state.memberJoined[mi] ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right" style={{ color: 'var(--ink-2)' }}>
                      {(() => {
                        const dep = state.memberDeposit[mi];
                        if (!state.finished) return <span className="tabular-nums">{formatUsdc(dep)}</span>;
                        if (dep > 0n) {
                          return (
                            <span>
                              <span className="tabular-nums">{formatUsdc(dep)}</span>
                              <span className="block text-xs" style={{ color: 'var(--muted)' }}>to take back</span>
                            </span>
                          );
                        }
                        const coveredRound = state.roundCovered.findIndex((rc) => rc[mi]);
                        if (coveredRound >= 0) return <span style={{ color: '#b45309' }}>Used for R{coveredRound + 1}</span>;
                        return <span style={{ color: 'var(--success)' }}>Returned</span>;
                      })()}
                    </td>
                    {Array.from({ length: memberCount }).map((_, r) => {
                      const st = paymentStatus(r, mi);
                      return (
                        <td key={r} className="py-2 px-1 text-center">
                          {st.label ? (
                            <span
                              className="inline-block w-full rounded-full px-1 py-0.5 text-xs font-semibold truncate"
                              style={{ color: st.color, background: st.bg, maxWidth: '100%' }}
                            >
                              {st.label}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--border)' }}>-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payout history */}
      {state.roundPaidOut.some(Boolean) && (
        <div className="rounded-3xl p-5 space-y-3" style={glass}>
          {/* Heading + explorer links */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="display text-sm font-bold" style={{ color: 'var(--ink)' }}>Payout history</p>
            <div className="flex items-center gap-3">
              <a
                href={`${network.explorer}/address/${circleAddress}?tab=logs`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
                style={{ color: 'var(--accent-hover)' }}
              >
                <ExternalLink className="size-3" />
                All payments
              </a>
              <a
                href={`${network.explorer}/address/${circleAddress}?tab=contract`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
                style={{ color: 'var(--accent-hover)' }}
              >
                <ExternalLink className="size-3" />
                Verified source
              </a>
            </div>
          </div>
          <div className="space-y-2">
            {state.roundPaidOut.map((paid, r) => {
              if (!paid) return null;
              const recipient = state.roundRecipient[r];
              const isMe = isConnected && recipient.toLowerCase() === walletAddress?.toLowerCase();
              return (
                <div key={r} className="flex items-center justify-between rounded-xl px-3 py-2" style={glassInner}>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                      Round {r + 1}
                    </p>
                    {/* One explorer link for the recipient — no duplicate */}
                    <a
                      href={explorerAddr(network.chainId, recipient)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs mono hover:underline"
                      style={{ color: isMe ? 'var(--accent-hover)' : 'var(--muted)' }}
                    >
                      {isMe ? 'You' : formatAddress(recipient)}
                    </a>
                  </div>
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--success)' }}>
                    {formatUsdc(state.roundPot[r])} USDC
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Shortfall notice */}
      {isMember && (state.memberShortfall[memberIndex] ?? 0n) > 0n && (
        <div className="rounded-2xl p-4" style={{ background: 'rgba(186,43,76,0.07)', border: '1px solid rgba(186,43,76,0.18)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>
            You have {Number(state.memberMissed[memberIndex])} missed payment{Number(state.memberMissed[memberIndex]) !== 1 ? 's' : ''}{' '}
            and owe {formatUsdc(state.memberShortfall[memberIndex])} USDC to the group.
          </p>
        </div>
      )}
    </div>
  );
}
