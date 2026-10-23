import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { Plus, Users, ArrowRight } from 'lucide-react';
import { NetworkBadge } from './NetworkBadge';
import { CircleListItem } from './CircleListItem';
import { CircleCard } from './CircleCard';
import { CreateCircleForm } from './CreateCircleForm';
import { useMyCircles } from '../hooks/useCircleState';
import { type NetworkConfig } from '../network';

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.64)',
  backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.68)',
  boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
};

interface Props {
  network: NetworkConfig;
  onOpenCircle: (address: `0x${string}`) => void;
}

export function HomeView({ network, onOpenCircle }: Props) {
  const { address, isConnected } = useAccount();
  const [showCreate, setShowCreate] = useState(false);

  // Fix 1: reads always use the active network's chainId, never the wallet's chain.
  const { circles, isLoading } = useMyCircles(
    network.factoryAddress,
    address,
    network.chainId,
  );

  const handleCreated = () => {
    setShowCreate(false);
  };

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Ajo Circle</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Rotating savings, onchain</p>
        </div>
        <div className="flex items-center gap-2">
          <NetworkBadge network={network} />
          <ConnectKitButton />
        </div>
      </div>

      {/* ---- NOT CONNECTED ---- */}
      {!isConnected && (
        /* At lg+: side-by-side two columns. Below lg: single column stack. */
        <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-4 lg:space-y-0 lg:items-start">
          {/* Explainer — left column */}
          <div className="rounded-3xl p-6 space-y-3 h-full" style={glass}>
            <div
              className="size-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(18,45,69,0.07)' }}
            >
              <Users className="size-6" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>Save together, take turns</p>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
                An ajo is a savings circle where a small group of people each put in the same amount every round. One person takes the whole pot each round, rotating until everyone has had a turn.
              </p>
              <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
                Normally a trusted organiser holds the money. Here a smart contract on Arc holds it instead, so no one person controls the funds and every payment is visible to all members.
              </p>
            </div>
            <ConnectKitButton label="Connect wallet to start a circle" />
          </div>

          {/* Featured circle card — right column */}
          {network.featuredCircle ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                  Live on {network.name}
                </p>
                <div
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ background: 'rgba(26,128,71,0.12)', color: '#1a8047', border: '1px solid rgba(26,128,71,0.25)' }}
                >
                  <span className="inline-block size-1.5 rounded-full" style={{ background: '#1a8047' }} />
                  Real circle
                </div>
              </div>
              <CircleCard
                address={network.featuredCircle}
                chainId={network.chainId}
                onClick={() => onOpenCircle(network.featuredCircle!)}
              />
              <button
                onClick={() => onOpenCircle(network.featuredCircle!)}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-2.5 text-xs font-semibold transition-opacity hover:opacity-70"
                style={{ color: 'var(--accent-hover)' }}
              >
                View this circle read-only <ArrowRight className="size-3.5" />
              </button>
            </div>
          ) : (
            /* No featured circle: keep column balanced on desktop */
            <div className="hidden lg:block" />
          )}
        </div>
      )}

      {/* ---- CONNECTED ---- */}
      {isConnected && (
        <>
          {/* Start / cancel toggle */}
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5 text-sm font-semibold transition-all hover:scale-[1.005]"
            style={{
              background: showCreate ? 'var(--surface-muted)' : 'var(--accent)',
              color: showCreate ? 'var(--ink-2)' : 'white',
              border: showCreate ? '1px solid var(--border)' : 'none',
            }}
          >
            <span>{showCreate ? 'Cancel' : 'Start a new circle'}</span>
            <Plus
              className="size-4"
              style={{ transform: showCreate ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}
            />
          </button>

          {/* Create form */}
          {showCreate && (
            <CreateCircleForm network={network} onCreated={handleCreated} />
          )}

          {/* My circles */}
          {!showCreate && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="display text-sm font-bold" style={{ color: 'var(--ink)' }}>My circles</p>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                  Invitations appear at the bottom
                </p>
              </div>
              {isLoading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-20 rounded-2xl bg-white/50" />
                  <div className="h-20 rounded-2xl bg-white/50" />
                </div>
              ) : circles.length === 0 ? (
                <div className="rounded-2xl p-6 text-center space-y-2" style={{ ...glass, boxShadow: 'none' }}>
                  <Users className="size-8 mx-auto" style={{ color: 'var(--subtle)' }} />
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    You are not in any circles yet.
                  </p>
                  <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                    Start one above, or ask someone to create a circle with your address.
                  </p>
                </div>
              ) : (
                circles.map((addr) => (
                  <CircleListItem
                    key={addr}
                    address={addr}
                    walletAddress={address!}
                    chainId={network.chainId}
                    factoryAddress={network.factoryAddress}
                    onClick={() => onOpenCircle(addr)}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
