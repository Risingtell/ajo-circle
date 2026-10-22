import React, { useState, useRef, useEffect } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { ChevronDown } from 'lucide-react';
import { NETWORKS, DEFAULT_NETWORK, type NetworkConfig } from '../network';

interface Props {
  /** Active network derived from wallet or URL. Passed in from App. */
  network: NetworkConfig;
}

export function NetworkBadge({ network }: Props) {
  const { isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isTestnet = network.isTestnet;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const badge = (
    <button
      onClick={() => { if (isConnected) setOpen((v) => !v); }}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
      style={{
        background: isTestnet ? 'rgba(133,177,237,0.18)' : 'rgba(26,128,71,0.12)',
        color: isTestnet ? '#1061a6' : '#1a8047',
        border: isTestnet ? '1px solid rgba(133,177,237,0.4)' : '1px solid rgba(26,128,71,0.25)',
        cursor: isConnected ? 'pointer' : 'default',
      }}
    >
      <span
        className="inline-block size-1.5 rounded-full"
        style={{ background: isTestnet ? '#1061a6' : '#1a8047' }}
      />
      {network.label}
      {isConnected && <ChevronDown className="size-3 ml-0.5" style={{ opacity: 0.6 }} />}
    </button>
  );

  if (!isConnected) return badge;

  const arcNetworks = Object.values(NETWORKS);

  return (
    <div ref={ref} className="relative">
      {badge}
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 rounded-2xl overflow-hidden shadow-lg min-w-[140px]"
          style={{
            background: 'rgba(255,255,255,0.96)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(200,210,220,0.5)',
          }}
        >
          <p
            className="px-3 pt-2.5 pb-1 text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--subtle)' }}
          >
            Switch network
          </p>
          {arcNetworks.map((n) => {
            const isActive = n.chainId === network.chainId;
            return (
              <button
                key={n.key}
                onClick={() => {
                  switchChain({ chainId: n.chainId });
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-slate-50"
                style={{ color: isActive ? 'var(--accent)' : 'var(--ink-2)' }}
              >
                <span
                  className="inline-block size-1.5 rounded-full flex-shrink-0"
                  style={{ background: isActive ? 'var(--accent)' : 'var(--subtle)' }}
                />
                {n.name}
                {isActive && (
                  <span className="ml-auto text-xs" style={{ color: 'var(--accent)', opacity: 0.7 }}>
                    Active
                  </span>
                )}
              </button>
            );
          })}
          <div className="h-2" />
        </div>
      )}
    </div>
  );
}

export { DEFAULT_NETWORK };
