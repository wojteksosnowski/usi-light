// src/components/layout/project/ProjectDevToolsCard.tsx
// Narzędzia deweloperskie z panelem sterowania nagrywaniem i katalogiem sesji

import React from 'react';
import {
  Upload,
  Download,
  Wrench,
  Video,
  StopCircle,
  FolderOpen,
  MousePointer,
  Keyboard,
  Timer,
  Box,
  Smartphone,
} from 'lucide-react';
import { useUiStore } from '../../../store/useUiStore';
import { useProjectIO } from './hooks/useProjectIO';
import { useActionRecorderStore } from '../../../modules/action-recorder/useActionRecorderStore';
import { ActionRecorderEngine } from '../../../modules/action-recorder/ActionRecorderEngine';
import { downloadBlob, downloadJson } from '../../../modules/action-recorder/actionRecorderStorage';
import { AspectRatioOption, VideoFormatOption } from '../../../modules/action-recorder/types';

export const ProjectDevToolsCard: React.FC = () => {
  const { handleSceneFileUpload, handleSceneDownload } = useProjectIO();

  const isRecording = useActionRecorderStore((s) => s.isRecording);
  const recordingTimeMs = useActionRecorderStore((s) => s.recordingTimeMs);
  const settings = useActionRecorderStore((s) => s.settings);
  const updateSettings = useActionRecorderStore((s) => s.updateSettings);
  const setIsCatalogOpen = useActionRecorderStore((s) => s.setIsCatalogOpen);

  const isLocalhost = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    const host = window.location.host;
    const hostname = window.location.hostname;
    return (
      host === 'localhost:3000' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      Boolean((import.meta as any).env?.DEV)
    );
  }, []);

  if (!isLocalhost) {
    return null;
  }

  const handleToggleRecording = async () => {
    const engine = ActionRecorderEngine.getInstance();
    if (isRecording) {
      const result = await engine.stop();
      if (result) {
        const titleSafe = result.session.title.replace(/\s+/g, '_');
        const ext = result.extension || 'webm';
        downloadBlob(result.videoBlob, `${titleSafe}.${ext}`);
        downloadJson(result.session, `${titleSafe}.json`);
      }
    } else {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      const container = canvas?.parentElement as HTMLElement | null;
      if (canvas) {
        await engine.start(canvas, container);
      }
    }
  };

  const formatRecTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const tenths = Math.floor((ms % 1000) / 100);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
  };

  return (
    <div className="ui-card">
      <div className="ui-title">
        <span>Narzędzia deweloperskie</span>
        <Wrench size={14} color="var(--text-secondary)" />
      </div>

      {/* ── 1. Rejestrator Demo / Wideo ───────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
        {/* Przycisk Start / Stop Nagrywania */}
        <button
          type="button"
          onClick={handleToggleRecording}
          className={isRecording ? 'btn-secondary' : 'btn-primary'}
          style={{
            padding: '8px 10px',
            fontSize: '11px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'pointer',
            border: isRecording ? '1px solid var(--accent-rose)' : undefined,
            color: isRecording ? 'var(--accent-rose)' : '#ffffff',
          }}
          title={isRecording ? 'Zatrzymaj nagrywanie (~)' : 'Rozpocznij nagrywanie (~)'}
        >
          {isRecording ? (
            <>
              <StopCircle size={14} color="var(--accent-rose)" />
              <span>Zatrzymaj nagranie ({formatRecTime(recordingTimeMs)})</span>
            </>
          ) : (
            <>
              <Video size={14} />
              <span>Nagraj akcje [~]</span>
            </>
          )}
        </button>

        {/* Wybór formatu kadru (Aspect Ratio) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {(['1:1', '16:9', 'viewport'] as AspectRatioOption[]).map((aspect) => (
            <button
              key={aspect}
              type="button"
              onClick={() => updateSettings({ aspectRatio: aspect })}
              style={{
                flex: 1,
                padding: '4px 2px',
                borderRadius: '6px',
                fontSize: '9.5px',
                fontWeight: 600,
                cursor: 'pointer',
                border: '1px solid var(--border-color)',
                background:
                  settings.aspectRatio === aspect
                    ? 'var(--accent-blue)'
                    : 'var(--bg-input)',
                color:
                  settings.aspectRatio === aspect
                    ? '#ffffff'
                    : 'var(--text-secondary)',
              }}
            >
              {aspect === '1:1' ? '1:1 Kwadrat' : aspect === '16:9' ? '16:9 Wideo' : 'Pełny'}
            </button>
          ))}
        </div>

        {/* Wybór formatu pliku (MP4 / WebM / GIF) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {(['mp4', 'webm', 'gif'] as VideoFormatOption[]).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => updateSettings({ videoFormat: fmt })}
              style={{
                flex: 1,
                padding: '3px 2px',
                borderRadius: '6px',
                fontSize: '9.5px',
                fontWeight: 600,
                cursor: 'pointer',
                border: '1px solid var(--border-color)',
                background:
                  settings.videoFormat === fmt
                    ? 'var(--accent-cyan)'
                    : 'var(--bg-input)',
                color:
                  settings.videoFormat === fmt
                    ? 'var(--bg-card)'
                    : 'var(--text-secondary)',
              }}
              title={
                fmt === 'mp4'
                  ? 'Format MP4 (H.264 / AVC) - idealny do uniwersalnego odtwarzania'
                  : fmt === 'webm'
                  ? 'Format WebM (VP9) - wysoka kompresja wideo'
                  : 'Animowany GIF - bezstratna animacja do dokumentacji/chatów'
              }
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Przełączniki opcji explainerowych (Kursor, Klawisze HUD, Odliczanie) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={() =>
              updateSettings({ showVirtualCursor: !settings.showVirtualCursor })
            }
            style={{
              flex: 1,
              padding: '4px 6px',
              borderRadius: '6px',
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              border: '1px solid var(--border-color)',
              background: settings.showVirtualCursor
                ? 'rgba(56, 189, 248, 0.15)'
                : 'var(--bg-input)',
              color: settings.showVirtualCursor
                ? 'var(--accent-cyan)'
                : 'var(--text-muted)',
            }}
            title="Wirtualny kursor i animowane fale kliknięć na wideo"
          >
            <MousePointer size={11} />
            <span>Kursor</span>
          </button>

          <button
            type="button"
            onClick={() =>
              updateSettings({ showKeystrokes: !settings.showKeystrokes })
            }
            style={{
              flex: 1,
              padding: '4px 6px',
              borderRadius: '6px',
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              border: '1px solid var(--border-color)',
              background: settings.showKeystrokes
                ? 'rgba(56, 189, 248, 0.15)'
                : 'var(--bg-input)',
              color: settings.showKeystrokes
                ? 'var(--accent-cyan)'
                : 'var(--text-muted)',
            }}
            title="Wyświetlaj wciśnięte skróty i klawisze modyfikatorów na nagraniu"
          >
            <Keyboard size={11} />
            <span>HUD</span>
          </button>

          <button
            type="button"
            onClick={() =>
              updateSettings({
                countdownSeconds: settings.countdownSeconds === 3 ? 0 : 3,
              })
            }
            style={{
              flex: 1,
              padding: '4px 6px',
              borderRadius: '6px',
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              border: '1px solid var(--border-color)',
              background: settings.countdownSeconds > 0
                ? 'rgba(56, 189, 248, 0.15)'
                : 'var(--bg-input)',
              color: settings.countdownSeconds > 0
                ? 'var(--accent-cyan)'
                : 'var(--text-muted)',
            }}
            title="Odliczanie 3-2-1 przed startem nagrania"
          >
            <Timer size={11} />
            <span>3s</span>
          </button>

          <button
            type="button"
            onClick={() =>
              updateSettings({
                show3DPreview: !settings.show3DPreview,
              })
            }
            style={{
              flex: 1,
              padding: '4px 6px',
              borderRadius: '6px',
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              border: '1px solid var(--border-color)',
              background: settings.show3DPreview
                ? 'rgba(56, 189, 248, 0.15)'
                : 'var(--bg-input)',
              color: settings.show3DPreview
                ? 'var(--accent-cyan)'
                : 'var(--text-muted)',
            }}
            title="Pływające okno podglądu 3D bryły w polu nagrywania"
          >
            <Box size={11} />
            <span>3D</span>
          </button>
        </div>

        {/* Przycisk otwierający Katalog Nagrań */}
        <button
          type="button"
          onClick={() => setIsCatalogOpen(true)}
          className="btn-secondary"
          style={{
            padding: '6px 8px',
            fontSize: '10.5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer',
            background: 'var(--bg-input)',
          }}
          title="Otwórz Katalog Nagrań i Sesji (odtwarzanie, pobieranie, import)"
        >
          <FolderOpen size={13} color="var(--accent-cyan)" />
          <span>Katalog Nagrań i Sesji</span>
        </button>

        {/* Przycisk uruchamiający tryb pokazowy Showcase / Kiosk Mobile */}
        <button
          type="button"
          onClick={() => useUiStore.getState().setMobileShowcasePreview(true)}
          className="btn-secondary"
          style={{
            padding: '6px 8px',
            fontSize: '10.5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer',
            background: 'rgba(56, 189, 248, 0.1)',
            borderColor: 'rgba(56, 189, 248, 0.3)',
            color: 'var(--accent-cyan)',
          }}
          title="Uruchom tryb pokazowy Showcase / Kiosk dla urządzeń mobilnych"
        >
          <Smartphone size={13} />
          <span>Podgląd Mobile Showcase (Kiosk)</span>
        </button>
      </div>

      <div style={{ height: '1px', background: 'var(--border-color)', margin: '8px 0' }} />

      {/* ── 2. Import / Eksport Sceny JSON ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
        <label
          className="btn-primary"
          style={{
            margin: 0,
            padding: '6px 4px',
            fontSize: '10.5px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            textAlign: 'center',
            cursor: 'pointer',
          }}
          title="Wgraj scenę JSON"
        >
          <Upload size={13} />
          <span>Wgraj scenę</span>
          <input type="file" accept=".json" onChange={handleSceneFileUpload} style={{ display: 'none' }} />
        </label>

        <button
          type="button"
          onClick={handleSceneDownload}
          className="btn-secondary"
          style={{
            padding: '6px 4px',
            fontSize: '10.5px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            textAlign: 'center',
          }}
          title="Zapisz scenę JSON"
        >
          <Download size={13} />
          <span>Zapisz JSON</span>
        </button>
      </div>
    </div>
  );
};
