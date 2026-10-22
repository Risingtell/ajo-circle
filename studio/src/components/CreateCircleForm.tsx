import React, { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { isAddress } from 'viem';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ActionButton } from './ActionButton';
import { TxLink } from './TxLink';
import { useCreateCircle } from '../hooks/useCircleActions';
import { type NetworkConfig } from '../network';
import { parseOnchainError, formatUsdc } from '../utils';
import { parseUnits } from 'viem';

const glass = {
  card: {
    background: 'rgba(255,255,255,0.64)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
};

const ROUND_PRESETS = [
  { label: '1 hour', seconds: 3600 },
  { label: '1 day', seconds: 86400 },
  { label: '1 week', seconds: 604800 },
  { label: 'Custom', seconds: 0 },
];

interface Props {
  network: NetworkConfig;
  onCreated: (circleAddress: `0x${string}`) => void;
}

export function CreateCircleForm({ network, onCreated }: Props) {
  const { address, chainId, isConnected } = useAccount();

  const [circleName, setCircleName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [roundPreset, setRoundPreset] = useState(1); // index into ROUND_PRESETS
  const [customSeconds, setCustomSeconds] = useState('');
  const [members, setMembers] = useState<string[]>(address ? [address] : ['']);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  // Sync first member when wallet connects
  React.useEffect(() => {
    if (address && members[0] === '') {
      setMembers((prev) => [address, ...prev.slice(1)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const { execute, hash, isPending, isConfirming, isSuccess, reset, isError, error } =
    useCreateCircle(network.factoryAddress, chainId, network.chainId);

  React.useEffect(() => {
    if (hash) setTxHash(hash);
  }, [hash]);

  React.useEffect(() => {
    if (isSuccess) {
      toast.success('Circle created! Waiting for indexing...');
      // The factory emits CircleCreated but we can't easily decode it here without getLogs.
      // Redirect to My Circles view; user will see the circle appear.
      setTimeout(() => onCreated('0x0000000000000000000000000000000000000000'), 1500);
    }
  }, [isSuccess, onCreated]);

  React.useEffect(() => {
    if (isError && error) {
      toast.error(parseOnchainError(error));
      reset();
    }
  }, [isError, error, reset]);

  const getRoundSeconds = useCallback((): number => {
    const preset = ROUND_PRESETS[roundPreset];
    if (preset.seconds > 0) return preset.seconds;
    const v = parseInt(customSeconds, 10);
    return isNaN(v) ? 0 : v;
  }, [roundPreset, customSeconds]);

  const addMember = () => setMembers((prev) => [...prev, '']);
  const removeMember = (i: number) => setMembers((prev) => prev.filter((_, idx) => idx !== i));
  const updateMember = (i: number, val: string) =>
    setMembers((prev) => prev.map((m, idx) => (idx === i ? val : m)));

  const validate = (): string | null => {
    if (!isConnected) return 'Connect your wallet first.';
    if (!circleName.trim()) return 'Circle name is required.';
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) return 'Enter a valid amount per round.';
    const rs = getRoundSeconds();
    if (rs < 60) return 'Round length must be at least 60 seconds.';
    const validMembers = members.filter((m) => m.trim());
    if (validMembers.length < 2) return 'Add at least 2 members.';
    for (const m of validMembers) {
      if (!isAddress(m)) return `${m} is not a valid address.`;
    }
    const unique = new Set(validMembers.map((m) => m.toLowerCase()));
    if (unique.size !== validMembers.length) return 'Duplicate member addresses found.';
    return null;
  };

  const handleCreate = () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    const validMembers = members.filter((m) => isAddress(m));
    const contribution = parseUnits(amountInput, 6);
    execute(circleName.trim(), validMembers, contribution, getRoundSeconds());
  };

  const labelStyle = { color: 'var(--muted)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em' };
  const inputStyle = { color: 'var(--ink)', background: 'transparent', outline: 'none', width: '100%' };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-5 space-y-4" style={glass.card}>
        <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>Start a circle</h2>

        {/* Circle name */}
        <div className="rounded-2xl p-3.5 space-y-1" style={glass.inner}>
          <p style={labelStyle}>Circle name</p>
          <input
            value={circleName}
            onChange={(e) => setCircleName(e.target.value)}
            placeholder="e.g. Friday Savings Group"
            className="text-sm font-medium placeholder:text-slate-300"
            style={inputStyle}
          />
        </div>

        {/* Amount */}
        <div className="rounded-2xl p-3.5 space-y-1" style={glass.inner}>
          <p style={labelStyle}>Amount per round (USDC)</p>
          <div className="flex items-baseline gap-2">
            <input
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '');
                if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setAmountInput(v);
              }}
              placeholder="0.00"
              className="display text-3xl font-bold tabular-nums placeholder:text-slate-300 flex-1"
              style={inputStyle}
            />
            <span className="text-base font-semibold" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
          {amountInput && !isNaN(parseFloat(amountInput)) && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Pot per round: {formatUsdc(parseUnits(amountInput, 6) * BigInt(Math.max(members.filter(m => m.trim()).length, 1)))} USDC
            </p>
          )}
        </div>

        {/* Round length */}
        <div className="space-y-2">
          <p style={labelStyle}>Round length</p>
          <div className="flex gap-2 flex-wrap">
            {ROUND_PRESETS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => setRoundPreset(i)}
                className="rounded-xl px-3.5 py-2 text-xs font-semibold transition-all"
                style={{
                  background: roundPreset === i ? 'var(--accent)' : 'rgba(255,255,255,0.58)',
                  color: roundPreset === i ? 'white' : 'var(--ink-2)',
                  border: roundPreset === i ? 'none' : '1px solid var(--border)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {ROUND_PRESETS[roundPreset].seconds === 0 && (
            <div className="rounded-2xl p-3 flex items-center gap-2" style={glass.inner}>
              <input
                inputMode="numeric"
                value={customSeconds}
                onChange={(e) => setCustomSeconds(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter seconds (min 60)"
                className="text-sm flex-1 placeholder:text-slate-300"
                style={inputStyle}
              />
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>seconds</span>
            </div>
          )}
        </div>
      </div>

      {/* Members */}
      <div className="rounded-3xl p-5 space-y-3" style={glass.card}>
        <div className="flex items-center justify-between">
          <p className="display text-sm font-bold" style={{ color: 'var(--ink)' }}>Members in payout order</p>
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>{members.filter(m => m.trim()).length} / 20</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Each person pays once per round. Payouts happen in this order.
        </p>

        {members.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 rounded-2xl px-3.5 py-2.5 flex items-center gap-2" style={glass.inner}>
              <span
                className="size-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                {i + 1}
              </span>
              <input
                value={m}
                onChange={(e) => updateMember(i, e.target.value.trim())}
                placeholder="0x wallet address"
                className="flex-1 text-xs mono placeholder:text-slate-300"
                style={inputStyle}
                readOnly={i === 0 && !!address}
              />
            </div>
            {i > 0 && (
              <button
                onClick={() => removeMember(i)}
                className="p-2 rounded-xl transition-opacity hover:opacity-60"
                style={{ color: 'var(--danger)' }}
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}

        {members.length < 20 && (
          <button
            onClick={addMember}
            className="w-full flex items-center justify-center gap-2 rounded-2xl py-2.5 text-xs font-semibold transition-all hover:opacity-80"
            style={{ background: 'transparent', border: '1.5px dashed var(--border-strong)', color: 'var(--muted)' }}
          >
            <Plus className="size-3.5" />
            Add member
          </button>
        )}
      </div>

      <ActionButton
        label={!isConnected ? 'Connect wallet to continue' : 'Create circle'}
        sublabel={
          amountInput && !isNaN(parseFloat(amountInput)) && members.filter(m => m.trim()).length >= 2
            ? `${members.filter(m => m.trim()).length} members, ${formatUsdc(parseUnits(amountInput || '0', 6))} USDC deposit each`
            : undefined
        }
        onClick={handleCreate}
        disabled={!isConnected}
        isPending={isPending}
        isConfirming={isConfirming}
      />

      {txHash && (
        <div className="rounded-2xl p-4 text-center space-y-1" style={glass.inner}>
          <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>
            {isSuccess ? 'Circle created!' : 'Transaction sent'}
          </p>
          <TxLink hash={txHash} chainId={network.chainId} label="View on explorer" />
        </div>
      )}
    </div>
  );
}
