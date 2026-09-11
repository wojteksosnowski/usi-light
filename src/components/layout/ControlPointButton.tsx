import React from 'react';
import { MapPin } from 'lucide-react';
import { useCadToolStore } from '../../store';
import { useIdleGlint } from '../../hooks/useIdleGlint';

export const ControlPointButton: React.FC = () => {
  const facadePointMode = useCadToolStore((s) => s.facadePointMode);
  const setFacadePointMode = useCadToolStore((s) => s.setFacadePointMode);
  const setDrawingMode = useCadToolStore((s) => s.setDrawingMode);
  const setIsDimensionToolActive = useCadToolStore((s) => s.setIsDimensionToolActive);
  const setIsEditMode = useCadToolStore((s) => s.setIsEditMode);

  // Idle-glint: 2 sekundy wcześniej niż przycisk "Udostępnij" (30s/45s) w CadTopHud
  const isGlinting = useIdleGlint([28000, 43000]);

  return (
    <button
      type="button"
      className={`cad-control-point-btn ${facadePointMode ? 'active' : ''} ${isGlinting ? 'glinting' : ''}`}
      onClick={() => {
        setFacadePointMode(!facadePointMode);
        setDrawingMode('none');
        setIsDimensionToolActive(false);
        setIsEditMode(false);
      }}
      title="Dodaj punkt kontrolny analizy na fasadzie"
    >
      <MapPin size={16} />
    </button>
  );
};
