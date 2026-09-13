// src/components/preview/Recording3DPipWindow.tsx
// Pływające okno podglądu 3D (Picture-in-Picture) w polu rzutni i nagrywania CAD
// Wierne odwzorowanie 1:1 oryginalnego podglądu (bez sztucznej górnej belki)

import React, { useEffect, useMemo, useRef } from 'react';
import { useSceneStore } from '../../store';
import { useActionRecorderStore } from '../../modules/action-recorder/useActionRecorderStore';
import { BuildingIsoPreview } from './BuildingIsoPreview';

export const Recording3DPipWindow: React.FC = () => {
  const isRecording = useActionRecorderStore((s) => s.isRecording);
  const isCountingDown = useActionRecorderStore((s) => s.isCountingDown);
  const show3DPreview = useActionRecorderStore((s) => s.settings.show3DPreview);
  const pipPosition = useActionRecorderStore((s) => s.settings.pipPosition);
  const pipSize = useActionRecorderStore((s) => s.settings.pipSize);
  const setPipCanvas = useActionRecorderStore((s) => s.setPipCanvas);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const buildings = useSceneStore((s) => s.buildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);

  const isDemoRecordingActive = (isRecording || isCountingDown) && show3DPreview;

  // Aktywny budynek: zaznaczony -> projektowany (isTested) -> pierwszy na liście
  const activeBuilding = useMemo(() => {
    if (selectedBuildingId) {
      const found = buildings.find((b) => b.id === selectedBuildingId && b.category !== 'boundary');
      if (found) return found;
    }
    const tested = buildings.find((b) => b.isTested && b.category !== 'boundary');
    if (tested) return tested;
    return buildings.find((b) => b.category !== 'boundary') || null;
  }, [buildings, selectedBuildingId]);

  // Podświetlenie aktywnej krawędzi modyfikatora (taras/wykusz/uskok)
  const activeHighlight = useMemo(() => {
    if (!activeBuilding) return undefined;
    const modifiers = activeBuilding.modifiers || [];
    const modWithEdge = modifiers.find((m) => m.enabled && 'edgeIndex' in m && (m as any).edgeIndex !== undefined);
    if (!modWithEdge) return undefined;
    const edgeIdx = (modWithEdge as any).edgeIndex;
    if (edgeIdx === undefined || edgeIdx === -1) return 0;
    return edgeIdx;
  }, [activeBuilding]);

  const activeHighlightColor = useMemo(() => {
    if (!activeBuilding) return '#fed7aa';
    const modifiers = activeBuilding.modifiers || [];
    const modWithEdge = modifiers.find((m) => m.enabled && 'edgeIndex' in m && (m as any).edgeIndex !== undefined);
    if (!modWithEdge) return '#fed7aa';
    if (modWithEdge.type === 'terrace') return '#fed7aa';
    if (modWithEdge.type === 'bay_window') return '#fef08a';
    if (modWithEdge.type === 'corner_cut') return '#7dd3fc';
    return '#fed7aa';
  }, [activeBuilding]);

  const groupBuildings = useMemo(() => {
    if (!activeBuilding || !activeBuilding.groupId) return undefined;
    const inGroup = buildings.filter(
      (b) => b.groupId === activeBuilding.groupId && b.category !== 'boundary'
    );
    return inGroup.length > 1 ? inGroup : undefined;
  }, [buildings, activeBuilding]);

  // Rejestracja Canvasu WebGL Three.js w store do nagrywania wideo
  useEffect(() => {
    if (!isDemoRecordingActive || !containerRef.current) {
      setPipCanvas(null);
      return;
    }
    const canvas = containerRef.current.querySelector('canvas');
    if (canvas) {
      setPipCanvas(canvas as HTMLCanvasElement);
    }
  });

  if (!isDemoRecordingActive || !activeBuilding) {
    return null;
  }

  // Zwiększone wymiary w proporcji 4:3 (identycznie jak w oryginale)
  const dimensions = {
    small: { width: 360, height: 270 },
    medium: { width: 440, height: 330 },
    large: { width: 520, height: 390 },
  }[pipSize || 'medium'];

  const positionStyles: React.CSSProperties = {
    'bottom-right': { bottom: '24px', right: '24px' },
    'top-right': { top: '60px', right: '24px' },
    'bottom-left': { bottom: '24px', left: '24px' },
  }[pipPosition || 'bottom-right'];

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        ...positionStyles,
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid var(--border-light, #334155)',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
        backgroundColor: '#eeeeee',
        zIndex: 50,
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
      <BuildingIsoPreview
        building={activeBuilding}
        groupBuildings={groupBuildings}
        highlightEdgeIndex={activeHighlight}
        highlightColor={activeHighlightColor}
        hideToolbar={false}
      />
    </div>
  );
};
