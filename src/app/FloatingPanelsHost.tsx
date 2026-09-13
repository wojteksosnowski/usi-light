import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { FloatingInspectorAccordion } from '@/components/common/FloatingInspectorAccordion';
import { PointInspectorModal } from '@/components/PointInspectorModal';
import { BuildingModifiersPanel } from '@/components/modifiers/BuildingModifiersPanel';
import { ProjectParametersPanel } from '@/components/parameters/ProjectParametersPanel';
import { CompassRose } from '@/components/cad/CompassRose';
import { useSceneStore, useCadToolStore, useSolarAnalysisStore } from '@/store';
import { AnalysisPointResult } from '@/types/geometry';
import { SharedProjectLoadStatus } from '@/hooks/useSharedProjectLoader';

interface FloatingPanelsHostProps {
  activePointResult: AnalysisPointResult | null;
  selectedBuildingPinnedPoints: AnalysisPointResult[];
  loadStatus: SharedProjectLoadStatus;
  onDismissStatus: () => void;
}

export const FloatingPanelsHost: React.FC<FloatingPanelsHostProps> = ({
  activePointResult,
  selectedBuildingPinnedPoints,
  loadStatus,
  onDismissStatus,
}) => {
  // Scene Store
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);

  // CAD Tool Store
  const showModifiersPanel = useCadToolStore((s) => s.showModifiersPanel);
  const setShowModifiersPanel = useCadToolStore((s) => s.setShowModifiersPanel);
  const viewRotationDeg = useCadToolStore((s) => s.viewRotationDeg);
  const setViewRotationDeg = useCadToolStore((s) => s.setViewRotationDeg);
  const savedViewRotationDeg = useCadToolStore((s) => s.savedViewRotationDeg);
  const setSavedViewRotationDeg = useCadToolStore((s) => s.setSavedViewRotationDeg);

  // Solar Analysis Store
  const showProjectParameters = useSolarAnalysisStore((s) => s.showProjectParameters);
  const setShowProjectParameters = useSolarAnalysisStore((s) => s.setShowProjectParameters);
  const activePinnedPointId = useSolarAnalysisStore((s) => s.activePinnedPointId);
  const setActivePinnedPointId = useSolarAnalysisStore((s) => s.setActivePinnedPointId);
  const activePointMode = useSolarAnalysisStore((s) => s.activePointMode);
  const setActivePointMode = useSolarAnalysisStore((s) => s.setActivePointMode);
  const sunlightMethod = useSolarAnalysisStore((s) => s.sunlightMethod);
  const deletePinnedPoint = useSolarAnalysisStore((s) => s.deletePinnedPoint);
  const updatePinnedPointStorey = useSolarAnalysisStore((s) => s.updatePinnedPointStorey);

  // Exclusive accordion section: 'points' | 'modifiers' | 'parameters'
  const [activeAccordionSection, setActiveAccordionSection] = useState<'points' | 'modifiers' | 'parameters'>('parameters');

  // Switch to 'points' section when a pinned point is selected or added
  useEffect(() => {
    if (activePointResult) {
      setActiveAccordionSection('points');
    }
  }, [activePointResult?.id]);

  // Switch to 'modifiers' when modifier panel is opened and no active point
  useEffect(() => {
    if (showModifiersPanel && !activePointResult) {
      setActiveAccordionSection('modifiers');
    }
  }, [showModifiersPanel, activePointResult]);

  // Switch to 'parameters' when project parameters is toggled on and no other inspector is dominating
  useEffect(() => {
    if (showProjectParameters && !activePointResult && !showModifiersPanel) {
      setActiveAccordionSection('parameters');
    }
  }, [showProjectParameters, activePointResult, showModifiersPanel]);

  const hasPoints = !!activePointResult;
  const hasModifiers = !!(showModifiersPanel && selectedBuildingId);
  const hasParameters = showProjectParameters;
  const openSectionsCount = (hasPoints ? 1 : 0) + (hasModifiers ? 1 : 0) + (hasParameters ? 1 : 0);

  return (
    <>
      {/* Floating Inspector Accordion (Right Side) */}
      <FloatingInspectorAccordion>
        {/* Section 1: Facade Point Inspector */}
        {hasPoints && (
          <PointInspectorModal
            pointResult={activePointResult}
            allPoints={selectedBuildingPinnedPoints}
            activePointId={activePinnedPointId}
            onSelectPointId={setActivePinnedPointId}
            onDeletePointId={deletePinnedPoint}
            onStoreyChange={updatePinnedPointStorey}
            activeMode={activePointMode}
            sunlightMethod={sunlightMethod}
            onModeChange={setActivePointMode}
            onClose={() => {
              selectedBuildingPinnedPoints.forEach((p) => deletePinnedPoint(p.id));
            }}
            isEmbedded={true}
            isCollapsed={openSectionsCount > 1 ? activeAccordionSection !== 'points' : false}
            onToggleCollapse={(collapsed) => {
              setActiveAccordionSection(collapsed ? (hasModifiers ? 'modifiers' : 'parameters') : 'points');
            }}
          />
        )}

        {/* Section 2: Building 2.5D Modifiers Panel */}
        {hasModifiers && (
          <BuildingModifiersPanel
            onClose={() => setShowModifiersPanel(false)}
            isEmbedded={true}
            isCollapsed={openSectionsCount > 1 ? activeAccordionSection !== 'modifiers' : false}
            onToggleCollapse={(collapsed) => {
              setActiveAccordionSection(collapsed ? (hasPoints ? 'points' : 'parameters') : 'modifiers');
            }}
          />
        )}

        {/* Section 3: Project Parameters & Surface Balance Panel */}
        {hasParameters && (
          <ProjectParametersPanel
            onClose={() => setShowProjectParameters(false)}
            isEmbedded={true}
            isCollapsed={openSectionsCount > 1 ? activeAccordionSection !== 'parameters' : false}
            onToggleCollapse={(collapsed) => {
              setActiveAccordionSection(collapsed ? (hasPoints ? 'points' : 'modifiers') : 'parameters');
            }}
          />
        )}
      </FloatingInspectorAccordion>

      {/* Rotatable Compass Rose (Bottom-Right) */}
      <CompassRose
        rotationDeg={viewRotationDeg}
        savedRotationDeg={savedViewRotationDeg}
        onResetRotation={() => {
          setViewRotationDeg((prev) => {
            if (Math.abs(prev) > 0.001) {
              setSavedViewRotationDeg(prev);
              return 0;
            } else if (Math.abs(savedViewRotationDeg) > 0.001) {
              return savedViewRotationDeg;
            }
            return 0;
          });
        }}
      />

      {/* Shared Project Toast Notification */}
      {loadStatus.status !== 'idle' && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            backgroundColor: 'rgba(11, 19, 41, 0.95)',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${
              loadStatus.status === 'error'
                ? 'var(--accent-rose)'
                : loadStatus.status === 'success'
                ? 'var(--accent-emerald)'
                : 'var(--accent-indigo)'
            }`,
            borderRadius: '12px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
            fontSize: '12px',
            color: 'var(--text-primary)',
          }}
        >
          {loadStatus.status === 'loading' && (
            <Loader2 size={16} color="var(--accent-indigo)" style={{ animation: 'spin 1s linear infinite' }} />
          )}
          {loadStatus.status === 'success' && (
            <CheckCircle2 size={16} color="var(--accent-emerald)" />
          )}
          {loadStatus.status === 'error' && (
            <AlertCircle size={16} color="var(--accent-rose)" />
          )}
          <span>{loadStatus.message}</span>
          {loadStatus.status !== 'loading' && (
            <button
              onClick={onDismissStatus}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Zamknij"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </>
  );
};
