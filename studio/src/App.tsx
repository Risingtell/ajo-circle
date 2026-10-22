import React, { useState, useEffect } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { HomeView } from './components/HomeView';
import { CirclePage } from './components/CirclePage';
import { useActiveNetwork } from './hooks/useActiveNetwork';
import { DEFAULT_NETWORK, getNetworkByKey, type NetworkConfig } from './network';

/** Parse ?circle=0x...&network=mainnet|testnet from the URL on first load. */
function parseUrlParams(): { circle: `0x${string}` | null; networkKey: string | null } {
  const p = new URLSearchParams(window.location.search);
  const circle = p.get('circle');
  const networkKey = p.get('network');
  return {
    circle: circle && /^0x[0-9a-fA-F]{40}$/.test(circle) ? (circle as `0x${string}`) : null,
    networkKey,
  };
}

type View =
  | { screen: 'home' }
  /** circleNetwork is locked when the circle is opened; it never changes with the wallet. */
  | { screen: 'circle'; address: `0x${string}`; circleNetwork: NetworkConfig };

const blob1: React.CSSProperties = {
  position: 'absolute', top: '8%', left: '5%', width: 300, height: 300,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 70%)',
  filter: 'blur(60px)', pointerEvents: 'none',
};

const blob2: React.CSSProperties = {
  position: 'absolute', bottom: '8%', right: '8%', width: 260, height: 260,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(255,205,131,0.20) 0%, transparent 70%)',
  filter: 'blur(58px)', pointerEvents: 'none',
};

export default function App() {
  const [initialParams] = useState(() => parseUrlParams());

  // Active network for the HOME view (wallet-derived or URL hint).
  const { network: homeNetwork, isWrongChain } = useActiveNetwork(initialParams.networkKey);
  const { isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  // Fix 2: view carries its own circleNetwork, locked at open time.
  // Deep-link: derive the circle's network directly from the URL key — never from the wallet.
  // getNetworkByKey falls back to DEFAULT_NETWORK when the key is absent or unrecognised.
  const [view, setView] = useState<View>(() => {
    if (initialParams.circle) {
      return {
        screen: 'circle',
        address: initialParams.circle,
        circleNetwork: getNetworkByKey(initialParams.networkKey),
      };
    }
    return { screen: 'home' };
  });

  // Keep URL in sync with the current view.
  useEffect(() => {
    if (view.screen === 'circle') {
      const params = new URLSearchParams({ circle: view.address, network: view.circleNetwork.key });
      window.history.replaceState(null, '', `?${params.toString()}`);
    } else {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [view]);

  // Opening a circle from the home list: lock to the home network.
  const handleOpenCircle = (address: `0x${string}`) =>
    setView({ screen: 'circle', address, circleNetwork: homeNetwork });

  const handleBack = () => setView({ screen: 'home' });

  return (
    <div
      className="relative min-h-dvh overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #f9f9fc 0%, #fffcf7 52%, #fbf7f2 100%)' }}
    >
      <div className="fixed inset-0 overflow-hidden" style={{ pointerEvents: 'none' }}>
        <div style={blob1} />
        <div style={blob2} />
      </div>

      {/* Wrong-chain banner (home only; circle page handles its own switch prompt inline) */}
      {isConnected && isWrongChain && view.screen === 'home' && (
        <div
          className="relative z-20 w-full px-4 py-2.5 text-center text-sm font-semibold"
          style={{ background: 'rgba(186,43,76,0.10)', borderBottom: '1px solid rgba(186,43,76,0.22)', color: '#ba2b4c' }}
        >
          Your wallet is on an unsupported network.{' '}
          <button
            onClick={() => switchChain({ chainId: DEFAULT_NETWORK.chainId })}
            className="underline font-bold ml-1 hover:opacity-70 transition-opacity"
          >
            Switch to Arc
          </button>
        </div>
      )}

      <div className="relative z-10 mx-auto w-full max-w-md lg:max-w-4xl px-4 pb-12 pt-6">
        {view.screen === 'home' && (
          <HomeView
            network={homeNetwork}
            onOpenCircle={handleOpenCircle}
          />
        )}
        {view.screen === 'circle' && (
          <CirclePage
            circleAddress={view.address}
            network={view.circleNetwork}
            onBack={handleBack}
          />
        )}
      </div>
    </div>
  );
}
