import React, { useState, useEffect, useMemo } from 'react';
import {
  Share2,
  Copy,
  Check,
  X,
  Clock,
  Zap,
  Globe,
  Loader2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import {
  useSceneStore,
  useSolarAnalysisStore,
  useCadToolStore,
} from '../../store';
import {
  createSharedPayloadFromState,
  compressProjectData,
  getCompressionStats,
  CompressionStats,
} from '../../utils/shareSerializer';
import { ShareApiResponse } from '../../types/sharing';

interface ShareProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareProjectModal: React.FC<ShareProjectModalProps> = ({ isOpen, onClose }) => {
  // Store States
  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const layerSettings = useSceneStore((s) => s.layerSettings);
  const selectedLayerName = useSceneStore((s) => s.selectedLayerName);
  const dimensions = useCadToolStore((s) => s.dimensions);
  const dxfUnit = useSceneStore((s) => s.dxfUnit);
  const dxfImportInfo = useSceneStore((s) => s.dxfImportInfo);

  const settings = useSolarAnalysisStore((s) => s.settings);
  const selectedCity = useSolarAnalysisStore((s) => s.selectedCity);
  const mapsInput = useSolarAnalysisStore((s) => s.mapsInput);
  const showNormals = useSolarAnalysisStore((s) => s.showNormals);
  const showShadowingLines = useSolarAnalysisStore((s) => s.showShadowingLines);
  const showSunlightLines = useSolarAnalysisStore((s) => s.showSunlightLines);
  const showShadowRange = useSolarAnalysisStore((s) => s.showShadowRange);
  const showShadowFill = useSolarAnalysisStore((s) => s.showShadowFill);
  const showSatelliteLayer = useSolarAnalysisStore((s) => s.showSatelliteLayer);
  const satelliteOpacity = useSolarAnalysisStore((s) => s.satelliteOpacity);
  const sunlightMethod = useSolarAnalysisStore((s) => s.sunlightMethod);
  const activePointMode = useSolarAnalysisStore((s) => s.activePointMode);
  const pinnedPoints = useSolarAnalysisStore((s) => s.pinnedPoints);
  const activePinnedPointId = useSolarAnalysisStore((s) => s.activePinnedPointId);

  const viewRotationDeg = useCadToolStore((s) => s.viewRotationDeg);
  const savedViewRotationDeg = useCadToolStore((s) => s.savedViewRotationDeg);

  // Local Component State
  const [isLoading, setIsLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<CompressionStats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Reset state when modal is opened
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setIsCopied(false);
    }
  }, [isOpen]);

  const testedCount = useMemo(() => buildings.filter((b) => b.isTested).length, [buildings]);
  const obstaclesCount = useMemo(() => buildings.filter((b) => !b.isTested && b.category !== 'boundary').length, [buildings]);

  if (!isOpen) return null;

  const handleGenerateLink = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setShareUrl(null);
    setStats(null);

    try {
      // 1. Ekstrakcja stanu i budowa payloadu
      const payload = createSharedPayloadFromState({
        buildings,
        selectedBuildingId,
        pinnedPoints,
        activePinnedPointId,
        layerSettings,
        selectedLayerName,
        dimensions,
        dxfUnit,
        dxfImportInfo,
        settings,
        selectedCity,
        mapsInput,
        showNormals,
        showShadowingLines,
        showSunlightLines,
        showShadowRange,
        showShadowFill,
        showSatelliteLayer,
        satelliteOpacity,
        sunlightMethod,
        activePointMode,
        viewRotationDeg,
        savedViewRotationDeg,
      });

      // 2. Kompresja po stronie klienta
      const compressedData = compressProjectData(payload);
      const computedStats = getCompressionStats(payload, compressedData);
      setStats(computedStats);

      // 3. Wysłanie na endpoint Vercel Serverless
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ compressedData }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Błąd serwera (${response.status})`);
      }

      const result = (await response.json()) as ShareApiResponse;
      const fullUrl = `${window.location.origin}${result.url}`;
      setShareUrl(fullUrl);
    } catch (err: any) {
      console.error('Błąd generowania linku udostępniania:', err);
      setErrorMessage(err.message || 'Nie udało się wygenerować linku do udostępnienia.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    } catch (err) {
      console.error('Nie udało się skopiować do schowka:', err);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '500px',
          backgroundColor: 'rgba(11, 19, 41, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-light)',
          borderRadius: '18px',
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          color: 'var(--text-primary)',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-indigo)',
              }}
            >
              <Share2 size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Udostępnij projekt
              </h2>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Generuj natychmiastowy link dla klienta lub zespołu
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            title="Zamknij"
          >
            <X size={18} />
          </button>
        </div>

        {/* Project Context Pill */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Lokalizacja projektu:</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>{selectedCity} ({settings.latitude.toFixed(2)}°N)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Zawartość sceny:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {buildings.length} obiektów ({testedCount} badanych, {obstaclesCount} przesłaniających)
            </span>
          </div>
          {pinnedPoints.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Punkty analizy nasłonecznienia:</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>{pinnedPoints.length} pkt</span>
            </div>
          )}
        </div>

        {/* Link Output or Action Area */}
        {shareUrl ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Check size={14} />
              <span>Link udostępniania został pomyślnie wygenerowany!</span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                padding: '6px 8px',
              }}
            >
              <input
                type="text"
                readOnly
                value={shareUrl}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '11.5px',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                }}
              />
              <button
                onClick={handleCopy}
                className="btn-primary"
                style={{
                  width: 'auto',
                  padding: '6px 14px',
                  fontSize: '11px',
                  borderRadius: '8px',
                  gap: '6px',
                  flexShrink: 0,
                }}
              >
                {isCopied ? <Check size={13} /> : <Copy size={13} />}
                <span>{isCopied ? 'Skopiowano!' : 'Kopiuj'}</span>
              </button>
            </div>

            {/* Stats and TTL badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '10.5px',
                color: 'var(--text-muted)',
                backgroundColor: 'rgba(6, 11, 24, 0.4)',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Clock size={12} color="var(--accent-amber)" />
                <span>Ważność linku: <strong>14 dni</strong></span>
              </div>
              {stats && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Zap size={12} color="var(--accent-indigo)" />
                  <span>Rozmiar: <strong>{(stats.compressedSizeBytes / 1024).toFixed(1)} KB</strong> (-{stats.reductionPercentage}%)</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{
                  textDecoration: 'none',
                  fontSize: '11.5px',
                  padding: '8px 12px',
                }}
              >
                <ExternalLink size={13} />
                <span>Otwórz w nowej karcie</span>
              </a>
              <button
                onClick={handleGenerateLink}
                className="btn-secondary"
                disabled={isLoading}
                style={{
                  fontSize: '11.5px',
                  padding: '8px 12px',
                }}
              >
                <span>Wygeneruj ponownie</span>
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                fontSize: '11.5px',
                color: 'var(--text-secondary)',
                lineHeight: '1.5',
                backgroundColor: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: '10px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <Globe size={16} color="var(--accent-indigo)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                Projekt zostanie skompresowany i zapisany w bezpiecznej chmurze (Upstash Redis). Każdy posiadacz linku będzie mógł natychmiast załadować całą geometrię i parametry nasłonecznienia.
              </div>
            </div>

            {errorMessage && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--accent-rose)',
                  backgroundColor: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              onClick={handleGenerateLink}
              disabled={isLoading}
              className="btn-primary"
              style={{
                fontSize: '12.5px',
                padding: '10px 16px',
                opacity: isLoading ? 0.75 : 1,
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Kompresja i generowanie linku...</span>
                </>
              ) : (
                <>
                  <Share2 size={15} />
                  <span>Utwórz link udostępniania</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
