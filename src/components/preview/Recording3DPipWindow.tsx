// src/components/preview/Recording3DPipWindow.tsx
// Pływające okno podglądu 3D (Picture-in-Picture) w polu rzutni i nagrywania CAD
// Wierne odwzorowanie 1:1 oryginalnego podglądu (bez sztucznej górnej belki)

import React, { useEffect, useMemo, useRef } from 'react';
import { useSceneStore, useUiStore } from '../../store';
import { useActionRecorderStore } from '../../modules/action-recorder/useActionRecorderStore';
import { getActiveHighlightEdgeIndex } from '@/types/modifiers';
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
  const expandedModifierId = useUiStore((s) => s.expandedModifierId);

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

  const activeHighlight = getActiveHighlightEdgeIndex(
    activeBuilding?.modifiers,
    expandedModifierId
  );

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
      className="recording-pip-card"
      style={{
        position: 'absolute',
        ...positionStyles,
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        zIndex: 50,
      }}
    >
      <BuildingIsoPreview
        building={activeBuilding}
        groupBuildings={groupBuildings}
        highlightEdgeIndex={activeHighlight}
        hideToolbar={false}
      />
    </div>
  );
};
