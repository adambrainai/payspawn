'use client';

import { useEffect, useState } from 'react';

// ============ Deterministic color from address ============

function hslFromAddress(address: string, offset = 0): string {
  const clean = address.toLowerCase().replace('0x', '');
  // Use different chunks of the address hash for each color
  const chunk = clean.slice(offset, offset + 4);
  const hue = (parseInt(chunk, 16) % 360);
  return `hsl(${hue}, 70%, 55%)`;
}

export function getAvatarColors(address: string): [string, string] {
  return [hslFromAddress(address, 0), hslFromAddress(address, 8)];
}

// ============ localStorage key ============

export function avatarStorageKey(address: string) {
  return `payspawn_avatar_${address.toLowerCase()}`;
}

export function getStoredAvatar(address: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(avatarStorageKey(address));
}

export function setStoredAvatar(address: string, emoji: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(avatarStorageKey(address), emoji);
}

// ============ RainbowKit custom avatar ============

interface AvatarComponentProps {
  address: string;
  ensImage?: string | null;
  ensName?: string | null;
  size: number;
}

export function WalletAvatar({ address, ensImage, size }: AvatarComponentProps) {
  const [custom, setCustom] = useState<string | null>(null);

  useEffect(() => {
    setCustom(getStoredAvatar(address));
    // Listen for storage changes (when user updates avatar in dashboard)
    const handler = (e: StorageEvent) => {
      if (e.key === avatarStorageKey(address)) {
        setCustom(e.newValue);
      }
    };
    window.addEventListener('storage', handler);
    // Also poll localStorage for same-tab updates
    const interval = setInterval(() => {
      setCustom(getStoredAvatar(address));
    }, 500);
    return () => {
      window.removeEventListener('storage', handler);
      clearInterval(interval);
    };
  }, [address]);

  if (ensImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ensImage}
        alt="avatar"
        width={size}
        height={size}
        style={{ borderRadius: '50%', width: size, height: size, objectFit: 'cover' }}
      />
    );
  }

  const [c1, c2] = getAvatarColors(address);
  const initials = address.slice(2, 4).toUpperCase();

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: custom
          ? `linear-gradient(135deg, ${c1}, ${c2})`
          : `linear-gradient(135deg, ${c1}, ${c2})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: custom ? size * 0.55 : size * 0.36,
        fontWeight: custom ? 'normal' : '700',
        fontFamily: custom ? 'inherit' : 'monospace',
        color: 'white',
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {custom || initials}
    </div>
  );
}

// ============ Avatar picker (use in dashboard) ============

const SYMBOL_OPTIONS = [
  '⚡', '🤖', '🧠', '👾', '🔮', '🌐', '⬡', '🛸', '🔑', '💎',
  '🦾', '🌀', '⚙️', '🔐', '🚀', '🧬', '🌊', '🎯', '🏴', '∞',
];

interface AvatarPickerProps {
  address: string;
  onSave?: (symbol: string) => void;
}

export function AvatarPicker({ address, onSave }: AvatarPickerProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSelected(getStoredAvatar(address));
  }, [address]);

  const handlePick = (symbol: string) => {
    const next = selected === symbol ? null : symbol;
    setSelected(next);
    if (next) {
      setStoredAvatar(address, next);
    } else {
      localStorage.removeItem(avatarStorageKey(address));
    }
    // Trigger storage event for same-tab updates
    window.dispatchEvent(new StorageEvent('storage', {
      key: avatarStorageKey(address),
      newValue: next,
    }));
    onSave?.(next || '');
    setOpen(false);
  };

  const [c1, c2] = getAvatarColors(address);

  return (
    <div className="flex items-center gap-4">
      {/* Current avatar preview */}
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold font-mono cursor-pointer ring-2 ring-white/10 hover:ring-[#F65B1A]/50 transition-all"
        style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, fontSize: selected ? 22 : 14 }}
        onClick={() => setOpen(!open)}
        title="Click to change"
      >
        {selected || address.slice(2, 4).toUpperCase()}
      </div>

      <div className="flex-1">
        <button
          onClick={() => setOpen(!open)}
          className="text-xs tracking-[0.2em] uppercase text-[#F65B1A] hover:text-white transition-colors"
        >
          {open ? 'Close' : selected ? 'Change symbol' : 'Pick a symbol'}
        </button>
        {selected && !open && (
          <button
            onClick={() => handlePick(selected)}
            className="ml-4 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            Reset to default
          </button>
        )}
      </div>

      {/* Symbol grid */}
      {open && (
        <div className="absolute mt-16 z-50 bg-black border border-white/20 p-3 grid grid-cols-5 gap-1.5 shadow-2xl">
          {SYMBOL_OPTIONS.map((sym) => (
            <button
              key={sym}
              onClick={() => handlePick(sym)}
              className={`w-10 h-10 text-xl flex items-center justify-center hover:bg-white/10 transition-colors rounded ${
                selected === sym ? 'bg-[#F65B1A]/20 ring-1 ring-[#F65B1A]' : ''
              }`}
              title={sym}
            >
              {sym}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
