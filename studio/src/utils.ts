export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatUsdc(raw: bigint, decimals = 6): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  if (fracStr === '') return whole.toLocaleString('en-US');
  return `${whole.toLocaleString('en-US')}.${fracStr.slice(0, 2)}`;
}

/** Returns e.g. "2h 14m 33s" or "Closed" */
export function formatCountdown(deadlineUnix: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = deadlineUnix - now;
  if (diff <= 0) return 'Closed';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 24 * 7) {
    const days = Math.floor(diff / 86400);
    return `${days}d ${Math.floor((diff % 86400) / 3600)}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatRoundLength(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 86400 * 7) return `${Math.round(seconds / 86400)}d`;
  return `${Math.round(seconds / (86400 * 7))}w`;
}

/** Plain-English round length: "1 hour", "2 days", "1 week", "45 minutes", etc. */
export function formatRoundLengthWords(seconds: number): string {
  if (seconds === 3600) return '1 hour';
  if (seconds === 86400) return '1 day';
  if (seconds === 604800) return '1 week';
  if (seconds < 3600) {
    const m = Math.round(seconds / 60);
    return `${m} minute${m !== 1 ? 's' : ''}`;
  }
  if (seconds < 86400) {
    const h = Math.round(seconds / 3600);
    return `${h} hour${h !== 1 ? 's' : ''}`;
  }
  if (seconds < 86400 * 7) {
    const d = Math.round(seconds / 86400);
    return `${d} day${d !== 1 ? 's' : ''}`;
  }
  const w = Math.round(seconds / (86400 * 7));
  return `${w} week${w !== 1 ? 's' : ''}`;
}

export function parseOnchainError(error: unknown): string {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? '';
  if (msg.includes('user rejected') || msg.includes('denied')) return 'Cancelled.';
  if (msg.includes('notstarted')) return 'The circle has not started yet.';
  if (msg.includes('alreadystarted')) return 'The circle has already started.';
  if (msg.includes('alreadyfinished')) return 'The circle is already finished.';
  if (msg.includes('notmember')) return 'You are not a member of this circle.';
  if (msg.includes('alreadyjoined')) return 'You have already joined.';
  if (msg.includes('notjoined')) return 'You have not joined yet.';
  if (msg.includes('alreadypaid')) return 'You have already paid this round.';
  if (msg.includes('roundnotover')) return 'The round is still open. Wait for the deadline or everyone to pay.';
  if (msg.includes('alreadywithdrawn')) return 'You have already withdrawn your deposit.';
  if (msg.includes('nothingtoclaim')) return 'Nothing to collect yet.';
  if (msg.includes('wronground')) return 'Wrong round number.';
  if (msg.includes('insufficient')) return 'Insufficient USDC balance.';
  if (msg.includes('allowance')) return 'USDC allowance too low. Please approve first.';
  if (msg.includes('reverted')) return 'Transaction failed. Please try again.';
  return 'Something went wrong. Please try again.';
}
