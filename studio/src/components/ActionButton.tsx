import { Loader2 } from 'lucide-react';
import React from 'react';

interface ActionButtonProps {
  label: string;
  sublabel?: string;
  onClick: () => void;
  disabled?: boolean;
  isPending?: boolean;
  isConfirming?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function ActionButton({
  label,
  sublabel,
  onClick,
  disabled,
  isPending,
  isConfirming,
  variant = 'primary',
}: ActionButtonProps) {
  const busy = isPending || isConfirming;

  const bgMap = {
    primary: 'var(--accent)',
    secondary: 'var(--surface-strong)',
    danger: 'var(--danger)',
  };
  const colorMap = {
    primary: 'white',
    secondary: 'var(--ink)',
    danger: 'white',
  };

  return (
    <button
      disabled={disabled || busy}
      onClick={onClick}
      className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: bgMap[variant], color: colorMap[variant], border: variant === 'secondary' ? '1px solid var(--border)' : 'none' }}
    >
      {busy ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {isPending ? 'Confirm in wallet...' : 'Confirming...'}
        </span>
      ) : (
        <span className="flex flex-col items-center">
          <span>{label}</span>
          {sublabel && <span className="text-xs opacity-70 font-normal mt-0.5">{sublabel}</span>}
        </span>
      )}
    </button>
  );
}
