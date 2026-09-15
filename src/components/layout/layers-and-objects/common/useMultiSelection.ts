import { useCallback } from 'react';
import { useSceneStore } from '@/store';

export const useMultiSelection = () => {
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const selectedBuildingIds = useSceneStore((s) => s.selectedBuildingIds);
  const setSelectedBuildingId = useSceneStore((s) => s.setSelectedBuildingId);
  const setSelectedBuildingIds = useSceneStore((s) => s.setSelectedBuildingIds);

  const getSelectionStatus = useCallback(
    (items: { id: string }[]): 'all' | 'partial' | 'none' => {
      if (!items || items.length === 0) return 'none';
      const selectedSet = new Set(selectedBuildingIds);
      if (selectedBuildingId) selectedSet.add(selectedBuildingId);
      const count = items.filter((b) => selectedSet.has(b.id)).length;
      if (count === 0) return 'none';
      if (count === items.length) return 'all';
      return 'partial';
    },
    [selectedBuildingIds, selectedBuildingId]
  );

  const toggleGroupSelection = useCallback(
    (items: { id: string }[]) => {
      const itemIds = items.map((b) => b.id);
      const status = getSelectionStatus(items);
      if (status === 'all') {
        const remaining = selectedBuildingIds.filter((id) => !itemIds.includes(id));
        setSelectedBuildingIds(remaining);
        if (selectedBuildingId && itemIds.includes(selectedBuildingId)) {
          setSelectedBuildingId(remaining.length > 0 ? remaining[0] : null);
        }
      } else {
        const combined = Array.from(new Set([...selectedBuildingIds, ...itemIds]));
        setSelectedBuildingIds(combined);
        if (!selectedBuildingId && itemIds.length > 0) {
          setSelectedBuildingId(itemIds[0]);
        }
      }
    },
    [selectedBuildingIds, selectedBuildingId, getSelectionStatus, setSelectedBuildingIds, setSelectedBuildingId]
  );

  return { getSelectionStatus, toggleGroupSelection };
};
