// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlayerTransport } from './PlayerTransport';

const defaultProps = {
  isPlaying: false,
  isShuffleEnabled: false,
  repeatMode: 'off' as const,
  canGoPrevious: true,
  canGoNext: true,
  onPlayPause: vi.fn(),
  onPrevious: vi.fn(),
  onNext: vi.fn(),
  onToggleShuffle: vi.fn(),
  onCycleRepeatMode: vi.fn(),
  onOpenQueue: vi.fn(),
  onOpenLyrics: vi.fn(),
};

describe('PlayerTransport', () => {
  it('presents repeat as order playback or single repeat only', () => {
    const onCycleRepeatMode = vi.fn();
    const { rerender } = render(<PlayerTransport {...defaultProps} onCycleRepeatMode={onCycleRepeatMode} />);

    const repeatButton = screen.getByRole('button', { name: 'Repeat' });
    expect(repeatButton.getAttribute('aria-pressed')).toBe('false');
    expect(repeatButton.getAttribute('title')).toBe('Play in order');

    fireEvent.click(repeatButton);
    expect(onCycleRepeatMode).toHaveBeenCalledTimes(1);

    rerender(<PlayerTransport {...defaultProps} repeatMode="one" onCycleRepeatMode={onCycleRepeatMode} />);
    expect(screen.getByRole('button', { name: 'Repeat' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Repeat' }).getAttribute('title')).toBe('Repeat one');
  });
});
