import { ExternalLink } from 'lucide-react';
import { explorerTx, explorerAddr, DEFAULT_NETWORK } from '../network';

interface TxLinkProps {
  hash: string;
  chainId?: number;
  label?: string;
}

export function TxLink({ hash, chainId, label }: TxLinkProps) {
  const url = explorerTx(chainId ?? DEFAULT_NETWORK.chainId, hash);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
      style={{ color: 'var(--accent-hover)' }}
    >
      {label ?? `${hash.slice(0, 10)}...`}
      <ExternalLink className="size-3" />
    </a>
  );
}

interface AddrLinkProps {
  address: string;
  chainId?: number;
  label?: string;
}

export function AddrLink({ address, chainId, label }: AddrLinkProps) {
  const url = explorerAddr(chainId ?? DEFAULT_NETWORK.chainId, address);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
      style={{ color: 'var(--accent-hover)' }}
    >
      {label ?? `${address.slice(0, 6)}...${address.slice(-4)}`}
      <ExternalLink className="size-3" />
    </a>
  );
}
