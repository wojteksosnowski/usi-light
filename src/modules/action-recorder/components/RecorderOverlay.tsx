// src/modules/action-recorder/components/RecorderOverlay.tsx
// Nakładka UI: odliczanie 3-2-1 oraz pasek kontrolny odtwarzacza sesji (Replay Bar)

import React from 'react';
import { Play, Pause, Square, FastForward, RotateCcw, X } from 'lucide-react';
import { useActionRecorderStore } from '../useActionRecorderStore';
import { ActionReplayer } from '../ActionReplayer';

export const RecorderOverlay: React.FC = () => {
  const isCountingDown = useActionRecorderStore((s) => s.isCountingDown);
  const countdownValue = useActionRecorderStore((s) => s.countdownValue);
  const replayerStatus = useActionRecorderStore((s) => s.replayerStatus);

  const replayer = ActionReplayer.getInstance();

  const handlePlayPause = () => {
    if (replayerStatus.isPlaying) {
      replayer.pause();
    } else {
      replayer.play();
    }
  };

  const handleStop = () => {
    replayer.stop();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const timeMs = Number(e.target.value);
    replayer.seek(timeMs);
  };

  const handleSpeedChange = (speed: number) => {
    replayer.setSpeed(speed);
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
  };

  return (
    <>
      {/* ── 1. Ekran Odliczania 3-2-1 ──────────────────────────────────── */}
      {isCountingDown && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(2, 6, 23, 0.45)',
            backdropFilter: 'blur(4px)',
            zIndex: 100,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-indigo), var(--accent-blue))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '56px',
              fontWeight: 800,
              boxShadow: '0 0 40px rgba(59, 130, 246, 0.6)',
              animation: 'pulse 1s infinite',
            }}
          >
            {countdownValue}
          </div>
          <div
            style={{
              marginTop: '16px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Przygotuj się do nagrania...
          </div>
        </div>
      )}

      {/* ── 2. Pasek Kontrolny Odtwarzacza (Replay Floating Bar) ─────────── */}
      {replayerStatus.activeSession && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(11, 19, 41, 0.94)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--border-light)',
            borderRadius: '16px',
            padding: '10px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
            zIndex: 110,
            minWidth: '420px',
          }}
        >
          {/* Przycisk Play / Pause */}
          <button
            type="button"
            onClick={handlePlayPause}
            className="btn-primary"
            style={{
              width: '36px',
              height: '36px',
              padding: 0,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title={replayerStatus.isPlaying ? 'Pauza' : 'Odtwórz'}
          >
            {replayerStatus.isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>

          {/* Przycisk Od początku */}
          <button
            type="button"
            onClick={() => replayer.seek(0)}
            className="btn-secondary"
            style={{
              width: '32px',
              height: '32px',
              padding: 0,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title="Od początku"
          >
            <RotateCcw size={14} />
          </button>

          {/* Czas i Suwak Postępu (Timeline Scrubber) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                color: 'var(--text-secondary)',
                minWidth: '50px',
              }}
            >
              {formatTime(replayerStatus.currentTimeMs)}
            </span>

            <input
              type="range"
              min={0}
              max={replayerStatus.totalDurationMs}
              value={replayerStatus.currentTimeMs}
              onChange={handleSeek}
              style={{
                flex: 1,
                cursor: 'pointer',
                accentColor: 'var(--accent-blue)',
              }}
            />

            <span
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                color: 'var(--text-muted)',
                minWidth: '50px',
              }}
            >
              {formatTime(replayerStatus.totalDurationMs)}
            </span>
          </div>

          {/* Przełącznik Prędkości */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            {[0.5, 1, 1.5, 2].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => handleSpeedChange(spd)}
                style={{
                  padding: '4px 6px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background:
                    replayerStatus.playbackSpeed === spd
                      ? 'var(--accent-blue)'
                      : 'var(--bg-input)',
                  color:
                    replayerStatus.playbackSpeed === spd
                      ? '#ffffff'
                      : 'var(--text-secondary)',
                }}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* Zamknij Odtwarzacz */}
          <button
            type="button"
            onClick={handleStop}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Zamknij odtwarzacz"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
};
