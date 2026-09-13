import React, { useState, useEffect, useCallback } from 'react';
import { FolderKanban, Share2, X, Save, Trash2, Folder, CheckCircle2, Clock } from 'lucide-react';
import {
  useSolarAnalysisStore,
  useSceneStore,
  useCadToolStore,
  useUiStore,
} from '../../../store';
import {
  getStoredProjectsList,
  getStoredProjectById,
  saveProjectToStorage,
  deleteStoredProject,
  StoredProjectSummary,
} from '../../../utils/projectStorage';
import { ConfirmDeletePayload } from '../../common/ConfirmDeleteModal';

export const ProjectNameCard: React.FC = () => {
  const projectName = useSolarAnalysisStore((s) => s.projectName);
  const setProjectName = useSolarAnalysisStore((s) => s.setProjectName);
  const currentProjectId = useSolarAnalysisStore((s) => s.currentProjectId);
  const setCurrentProjectId = useSolarAnalysisStore((s) => s.setCurrentProjectId);

  const settings = useSolarAnalysisStore((s) => s.settings);
  const setSettings = useSolarAnalysisStore((s) => s.setSettings);
  const selectedCity = useSolarAnalysisStore((s) => s.selectedCity);
  const setSelectedCity = useSolarAnalysisStore((s) => s.setSelectedCity);
  const mapsInput = useSolarAnalysisStore((s) => s.mapsInput);
  const setMapsInput = useSolarAnalysisStore((s) => s.setMapsInput);
  const mapsParseError = useSolarAnalysisStore((s) => s.mapsParseError);
  const setMapsParseError = useSolarAnalysisStore((s) => s.setMapsParseError);
  const showNormals = useSolarAnalysisStore((s) => s.showNormals);
  const setShowNormals = useSolarAnalysisStore((s) => s.setShowNormals);
  const showShadowingLines = useSolarAnalysisStore((s) => s.showShadowingLines);
  const setShowShadowingLines = useSolarAnalysisStore((s) => s.setShowShadowingLines);
  const showSunlightLines = useSolarAnalysisStore((s) => s.showSunlightLines);
  const setShowSunlightLines = useSolarAnalysisStore((s) => s.setShowSunlightLines);
  const showShadowRange = useSolarAnalysisStore((s) => s.showShadowRange);
  const setShowShadowRange = useSolarAnalysisStore((s) => s.setShowShadowRange);
  const showShadowFill = useSolarAnalysisStore((s) => s.showShadowFill);
  const setShowShadowFill = useSolarAnalysisStore((s) => s.setShowShadowFill);
  const showSatelliteLayer = useSolarAnalysisStore((s) => s.showSatelliteLayer);
  const setShowSatelliteLayer = useSolarAnalysisStore((s) => s.setShowSatelliteLayer);
  const satelliteOpacity = useSolarAnalysisStore((s) => s.satelliteOpacity);
  const setSatelliteOpacity = useSolarAnalysisStore((s) => s.setSatelliteOpacity);
  const sunlightMethod = useSolarAnalysisStore((s) => s.sunlightMethod);
  const setSunlightMethod = useSolarAnalysisStore((s) => s.setSunlightMethod);
  const activePointMode = useSolarAnalysisStore((s) => s.activePointMode);
  const setActivePointMode = useSolarAnalysisStore((s) => s.setActivePointMode);
  const pinnedPoints = useSolarAnalysisStore((s) => s.pinnedPoints);
  const setPinnedPoints = useSolarAnalysisStore((s) => s.setPinnedPoints);
  const activePinnedPointId = useSolarAnalysisStore((s) => s.activePinnedPointId);
  const setActivePinnedPointId = useSolarAnalysisStore((s) => s.setActivePinnedPointId);

  const buildings = useSceneStore((s) => s.buildings);
  const setBuildings = useSceneStore((s) => s.setBuildings);
  const selectedBuildingId = useSceneStore((s) => s.selectedBuildingId);
  const setSelectedBuildingId = useSceneStore((s) => s.setSelectedBuildingId);
  const layerSettings = useSceneStore((s) => s.layerSettings);
  const setLayerSettings = useSceneStore((s) => s.setLayerSettings);
  const selectedLayerName = useSceneStore((s) => s.selectedLayerName);
  const setSelectedLayerName = useSceneStore((s) => s.setSelectedLayerName);
  const dxfUnit = useSceneStore((s) => s.dxfUnit);
  const setDxfUnit = useSceneStore((s) => s.setDxfUnit);
  const dxfImportInfo = useSceneStore((s) => s.dxfImportInfo);
  const setDxfImportInfo = useSceneStore((s) => s.setDxfImportInfo);

  const viewRotationDeg = useCadToolStore((s) => s.viewRotationDeg);
  const setViewRotationDeg = useCadToolStore((s) => s.setViewRotationDeg);
  const savedViewRotationDeg = useCadToolStore((s) => s.savedViewRotationDeg);
  const setSavedViewRotationDeg = useCadToolStore((s) => s.setSavedViewRotationDeg);
  const dimensions = useCadToolStore((s) => s.dimensions);
  const setDimensions = useCadToolStore((s) => s.setDimensions);
  const triggerFit = useCadToolStore((s) => s.triggerFit);

  const openModal = useUiStore((s) => s.openModal);
  const showCopiedToast = useUiStore((s) => s.showCopiedToast);

  const [projectsList, setProjectsList] = useState<StoredProjectSummary[]>([]);

  const refreshList = useCallback(() => {
    setProjectsList(getStoredProjectsList());
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleSaveCurrentProject = () => {
    const effectiveName = projectName.trim() || `Projekt ${selectedCity || 'Światło'}`;
    const saved = saveProjectToStorage(
      {
        name: effectiveName,
        version: 1,
        scene: {
          buildings,
          selectedBuildingId,
          layerSettings,
          selectedLayerName,
          pinnedPoints,
          activePinnedPointId,
          dimensions,
          dxfUnit,
          dxfImportInfo,
        },
        solar: {
          settings,
          selectedCity,
          mapsInput,
          mapsParseError,
          sunlightMethod,
          showNormals,
          showShadowingLines,
          showSunlightLines,
          showShadowRange,
          showShadowFill,
          showSatelliteLayer,
          satelliteOpacity,
          activePointMode,
        },
        viewport: {
          viewRotationDeg,
          savedViewRotationDeg,
        },
      },
      currentProjectId
    );

    setCurrentProjectId(saved.id);
    setProjectName(saved.name);
    refreshList();
    showCopiedToast(`Zapisano projekt „${saved.name}”`);
  };

  const handleLoadProject = (id: string) => {
    const data = getStoredProjectById(id);
    if (!data) return;

    setCurrentProjectId(data.id);
    setProjectName(data.name);

    if (data.scene) {
      setBuildings(data.scene.buildings ?? []);
      setSelectedBuildingId(data.scene.selectedBuildingId ?? (data.scene.buildings?.[0]?.id || null));
      setLayerSettings(data.scene.layerSettings ?? {});
      setSelectedLayerName(data.scene.selectedLayerName ?? null);
      setPinnedPoints(data.scene.pinnedPoints ?? []);
      setActivePinnedPointId(
        data.scene.activePinnedPointId ?? (data.scene.pinnedPoints?.[0]?.id || null)
      );
      if (data.scene.dimensions) setDimensions(data.scene.dimensions);
      if (data.scene.dxfUnit) setDxfUnit(data.scene.dxfUnit);
      if (data.scene.dxfImportInfo) setDxfImportInfo(data.scene.dxfImportInfo);
    }

    if (data.solar) {
      if (data.solar.settings) setSettings(data.solar.settings);
      if (data.solar.selectedCity) setSelectedCity(data.solar.selectedCity);
      if (data.solar.mapsInput !== undefined) setMapsInput(data.solar.mapsInput);
      if (data.solar.mapsParseError !== undefined) setMapsParseError(data.solar.mapsParseError);
      if (data.solar.sunlightMethod) setSunlightMethod(data.solar.sunlightMethod);
      if (data.solar.showNormals !== undefined) setShowNormals(data.solar.showNormals);
      if (data.solar.showShadowingLines !== undefined) setShowShadowingLines(data.solar.showShadowingLines);
      if (data.solar.showSunlightLines !== undefined) setShowSunlightLines(data.solar.showSunlightLines);
      if (data.solar.showShadowRange !== undefined) setShowShadowRange(data.solar.showShadowRange);
      if (data.solar.showShadowFill !== undefined) setShowShadowFill(data.solar.showShadowFill);
      if (data.solar.showSatelliteLayer !== undefined) setShowSatelliteLayer(data.solar.showSatelliteLayer);
      if (data.solar.satelliteOpacity !== undefined) setSatelliteOpacity(data.solar.satelliteOpacity);
      if (data.solar.activePointMode) setActivePointMode(data.solar.activePointMode);
    }

    if (data.viewport) {
      if (data.viewport.viewRotationDeg !== undefined) setViewRotationDeg(data.viewport.viewRotationDeg);
      if (data.viewport.savedViewRotationDeg !== undefined) setSavedViewRotationDeg(data.viewport.savedViewRotationDeg);
    }

    setTimeout(() => {
      triggerFit();
    }, 50);

    showCopiedToast(`Załadowano projekt „${data.name}”`);
  };

  const handleRequestDelete = (e: React.MouseEvent, project: StoredProjectSummary) => {
    e.stopPropagation();
    const payload: ConfirmDeletePayload = {
      projectId: project.id,
      projectName: project.name,
      onConfirm: (projId) => {
        deleteStoredProject(projId);
        if (currentProjectId === projId) {
          setCurrentProjectId(null);
        }
        refreshList();
        showCopiedToast('Projekt został usunięty');
      },
    };
    openModal('confirmDelete', payload as unknown as Record<string, unknown>);
  };

  return (
    <div className="ui-card">
      <div className="ui-title">
        <span>Projekt</span>
        <FolderKanban size={14} color="var(--accent-amber)" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Pasek nazwy projektu z przyciskiem zapisu */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <div className="project-location-bar" style={{ flex: 1 }}>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Nazwa projektu..."
              className="project-location-input"
              title="Nazwa bieżącego projektu"
            />
            {projectName && (
              <button
                type="button"
                onClick={() => setProjectName('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Wyczyść nazwę projektu"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleSaveCurrentProject}
            className="btn-tile active-amber"
            style={{
              width: 'auto',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 700,
              gap: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              flexShrink: 0,
            }}
            title={currentProjectId ? 'Zaktualizuj zapisany stan projektu' : 'Zapisz jako nowy projekt w pamięci podręcznej'}
          >
            <Save size={13} />
            <span>Zapisz</span>
          </button>
        </div>

        {/* Lista zapisanych projektów w LocalStorage */}
        {projectsList.length > 0 ? (
          <div className="project-list custom-scrollbar">
            {projectsList.map((p) => {
              const isCurrent = currentProjectId === p.id;
              const dateStr = new Date(p.updatedAt).toLocaleDateString('pl-PL', {
                day: 'numeric',
                month: 'numeric',
              });

              return (
                <div
                  key={p.id}
                  onClick={() => handleLoadProject(p.id)}
                  className={`project-list-item ${isCurrent ? 'active' : ''}`}
                  title={`Wczytaj projekt: ${p.name} (${p.buildingsCount} obiektów)`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                    {isCurrent ? (
                      <CheckCircle2 size={13} color="var(--accent-amber)" style={{ flexShrink: 0 }} />
                    ) : (
                      <Folder size={13} color="var(--accent-indigo)" style={{ flexShrink: 0 }} />
                    )}
                    <span className="project-item-title">{p.name}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span className="project-item-meta" title={`Zmodyfikowano: ${dateStr}`}>
                      {p.city ? `${p.city} • ` : ''}{p.buildingsCount} ob.
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleRequestDelete(e, p)}
                      className="project-delete-btn"
                      title="Usuń projekt z pamięci podręcznej"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              padding: '6px 8px',
              fontSize: '10.5px',
              color: 'var(--text-muted)',
              textAlign: 'center',
              backgroundColor: 'rgba(6, 11, 24, 0.4)',
              borderRadius: '6px',
              border: '1px dashed var(--border-color)',
            }}
          >
            Brak zapisanych projektów. Wpisz nazwę i kliknij <b>Zapisz</b>.
          </div>
        )}

        {/* Główny przycisk udostępniania */}
        <button
          type="button"
          onClick={() => openModal('share')}
          className="btn-share"
          title="Udostępnij projekt online za pomocą linku"
        >
          <Share2 size={14} />
          <span>Udostępnij projekt</span>
        </button>
      </div>
    </div>
  );
};

