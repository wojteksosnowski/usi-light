import { useEffect } from 'react';
import { useCadToolStore, useSceneStore } from '@/store';
import { isTypingTarget as isTypingTargetEl } from '@/utils/keyboardUtils';

export function useGlobalShortcuts() {
  const isDimensionToolActive = useCadToolStore((s) => s.isDimensionToolActive);
  const cancelDimension = useCadToolStore((s) => s.cancelDimension);
  const drawingMode = useCadToolStore((s) => s.drawingMode);
  const cancelAlign = useCadToolStore((s) => s.cancelAlign);
  const setDrawingMode = useCadToolStore((s) => s.setDrawingMode);
  const setDrawingVerticesCount = useCadToolStore((s) => s.setDrawingVerticesCount);
  const isEditMode = useCadToolStore((s) => s.isEditMode);
  const setIsEditMode = useCadToolStore((s) => s.setIsEditMode);
  const viewRotationMode = useCadToolStore((s) => s.viewRotationMode);
  const setViewRotationMode = useCadToolStore((s) => s.setViewRotationMode);
  const facadePointMode = useCadToolStore((s) => s.facadePointMode);
  const setFacadePointMode = useCadToolStore((s) => s.setFacadePointMode);
  const toggleOsnap = useCadToolStore((s) => s.toggleOsnap);

  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const selectedBuildingIds = useSceneStore((s) => s.selectedBuildingIds);
  const isLinkingMode = useSceneStore((s) => s.isLinkingMode);
  const setIsLinkingMode = useSceneStore((s) => s.setIsLinkingMode);
  const setLinkingSourceId = useSceneStore((s) => s.setLinkingSourceId);
  const setSelectedBuildingId = useSceneStore((s) => s.setSelectedBuildingId);
  const setSelectedLayerName = useSceneStore((s) => s.setSelectedLayerName);
  const deleteBuildings = useSceneStore((s) => s.deleteBuildings);
  const adjustSelectedBuildingHeight = useSceneStore((s) => s.adjustSelectedBuildingHeight);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTypingTarget = isTypingTargetEl(e.target);

      if (e.key === 'F3' || (e.shiftKey && (e.key === 'S' || e.key === 's') && !isTypingTarget)) {
        e.preventDefault();
        toggleOsnap();
        return;
      }

      if (e.key === 'Escape') {
        let handledTool = false;
        if (isDimensionToolActive) {
          cancelDimension();
          handledTool = true;
        }
        if (drawingMode === 'align') {
          cancelAlign();
        }
        if (drawingMode !== 'none') {
          setDrawingMode('none');
          setDrawingVerticesCount(0);
          handledTool = true;
        }
        if (isLinkingMode) {
          setIsLinkingMode(false);
          setLinkingSourceId(null);
          handledTool = true;
        }
        if (isEditMode) {
          setIsEditMode(false);
          handledTool = true;
        }
        if (viewRotationMode) {
          setViewRotationMode(false);
          handledTool = true;
        }
        if (facadePointMode) {
          setFacadePointMode(false);
          handledTool = true;
        }

        if (handledTool) return;

        setSelectedBuildingId(null);
        setSelectedLayerName(null);
        return;
      }

      if (isTypingTarget) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (drawingMode === 'vertexEdit') {
          return;
        }
        const targetIds =
          selectedBuildingIds.length > 0 ? selectedBuildingIds : selectedBuildingId ? [selectedBuildingId] : [];
        if (targetIds.length > 0) {
          e.preventDefault();
          deleteBuildings(targetIds);
          return;
        }
      }

      if (!selectedBuildingId) return;

      const isPlusKey = e.key === '+' || e.key === '=' || e.code === 'NumpadAdd';
      const isMinusKey = e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract';

      if (isPlusKey || isMinusKey) {
        e.preventDefault();
        adjustSelectedBuildingHeight(isPlusKey ? 0.5 : -0.5);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isDimensionToolActive,
    drawingMode,
    isLinkingMode,
    isEditMode,
    viewRotationMode,
    facadePointMode,
    selectedBuildingId,
    selectedBuildingIds,
    deleteBuildings,
    cancelDimension,
    cancelAlign,
    setDrawingMode,
    setDrawingVerticesCount,
    setIsLinkingMode,
    setLinkingSourceId,
    setIsEditMode,
    setViewRotationMode,
    setFacadePointMode,
    setSelectedBuildingId,
    setSelectedLayerName,
    adjustSelectedBuildingHeight,
    toggleOsnap,
  ]);
}
