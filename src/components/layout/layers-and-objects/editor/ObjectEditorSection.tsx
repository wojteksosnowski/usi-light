import React from 'react';
import { Building, Square, Layers } from 'lucide-react';
import { useObjectEditor } from './hooks/useObjectEditor';
import { PlaygroundInspector } from './PlaygroundInspector';
import { BuildingFloorsInspector } from './BuildingFloorsInspector';
import { SweepParamsInspector } from './SweepParamsInspector';
import { CompoundObjectInspector } from './CompoundObjectInspector';

export const ObjectEditorSection: React.FC = () => {
  const {
    selectedBuilding,
    selectedBuildingIds,
    selectedBuildingArea,
    playgroundAnalysis,
    sunlightMethod,
    groupBuildings,
    isLogicalGroupRootSelected,
    setOpenGroupId,
    updateGroup,
    rotateGroup,
    updateSelectedBuilding,
    handleSetBuildingAbsoluteRotation,
  } = useObjectEditor();

  if (!selectedBuilding) {
    return (
      <div className="ui-card" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
        Kliknij dowolny obiekt na rzucie CAD, aby edytować jego parametry.
      </div>
    );
  }

  const isBoundary = selectedBuilding.category === 'boundary';
  const isBalcony = selectedBuilding.category === 'balcony';
  const isPlayground = isBoundary && selectedBuilding.areaType === 'playground';

  const currentRotDeg = selectedBuilding.transform?.rotationDeg !== undefined
    ? selectedBuilding.transform.rotationDeg
    : selectedBuilding.segments.length > 0
    ? Number((((selectedBuilding.segments[0].angleRad * 180) / Math.PI + 360) % 360).toFixed(1))
    : 0;

  // Renderowanie dla Obiektu Logicznego (Grupy na Level 0)
  if (isLogicalGroupRootSelected) {
    return (
      <div className="ui-card">
        <div className="ui-title">
          <span>Obiekt Logiczny</span>
          <Layers size={14} color="var(--accent-cyan, #38bdf8)" />
        </div>
        <CompoundObjectInspector
          groupBuildings={groupBuildings}
          selectedBuilding={selectedBuilding}
          onUpdateGroup={updateGroup}
          onRotateGroup={rotateGroup}
          onEnterGroup={(gId) => setOpenGroupId(gId)}
        />
      </div>
    );
  }

  return (
    <div className="ui-card">
      <div className="ui-title">
        <span>
          {selectedBuildingIds.length > 1
            ? `Edycja obiektów (zaznaczono: ${selectedBuildingIds.length})`
            : 'Edycja Obiektu 2.5D'}
        </span>
        <Building size={14} color="var(--accent-indigo)" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* 1. Nazwa obiektu */}
        <div>
          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Nazwa
          </label>
          <input
            type="text"
            value={selectedBuilding.name}
            onChange={(e) => updateSelectedBuilding({ name: e.target.value })}
            style={{
              width: '100%',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              padding: '7px 10px',
              color: 'var(--text-primary)',
              fontSize: '12px',
            }}
          />
        </div>

        {/* 2. Przełączniki kategorii (Budynek / Obszar) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
          <button
            type="button"
            onClick={() => updateSelectedBuilding({ category: 'building' })}
            style={{
              padding: '6px 8px',
              borderRadius: '6px',
              border: !isBoundary && !isBalcony
                ? '1px solid var(--accent-indigo)'
                : '1px solid var(--border-light)',
              backgroundColor: !isBoundary && !isBalcony
                ? 'rgba(99, 102, 241, 0.25)'
                : 'var(--bg-input)',
              color: !isBoundary && !isBalcony ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: !isBoundary && !isBalcony ? 700 : 500,
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
            }}
          >
            <Building size={13} />
            <span>Budynek</span>
          </button>

          <button
            type="button"
            onClick={() => updateSelectedBuilding({ category: 'boundary', defaultHeight: 0 })}
            style={{
              padding: '6px 8px',
              borderRadius: '6px',
              border: isBoundary
                ? '1px solid var(--accent-rose)'
                : '1px solid var(--border-light)',
              backgroundColor: isBoundary
                ? 'rgba(244, 63, 94, 0.25)'
                : 'var(--bg-input)',
              color: isBoundary ? 'var(--accent-rose)' : 'var(--text-secondary)',
              fontWeight: isBoundary ? 700 : 500,
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
            }}
          >
            <Square size={13} />
            <span>Obszar</span>
          </button>
        </div>

        {isBoundary ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Podtyp Obszaru: Działka vs Plac zabaw */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Typ obszaru
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => updateSelectedBuilding({ areaType: 'plot' })}
                  style={{
                    padding: '5px 6px',
                    borderRadius: '6px',
                    border: !selectedBuilding.areaType || selectedBuilding.areaType === 'plot'
                      ? '1px solid var(--accent-rose)'
                      : '1px solid var(--border-light)',
                    backgroundColor: !selectedBuilding.areaType || selectedBuilding.areaType === 'plot'
                      ? 'rgba(244, 63, 94, 0.25)'
                      : 'var(--bg-input)',
                    color: !selectedBuilding.areaType || selectedBuilding.areaType === 'plot'
                      ? 'var(--accent-rose)'
                      : 'var(--text-secondary)',
                    fontWeight: !selectedBuilding.areaType || selectedBuilding.areaType === 'plot' ? 700 : 500,
                    fontSize: '10.5px',
                    cursor: 'pointer',
                  }}
                >
                  Działka
                </button>

                <button
                  type="button"
                  onClick={() => updateSelectedBuilding({ areaType: 'playground' })}
                  style={{
                    padding: '5px 6px',
                    borderRadius: '6px',
                    border: isPlayground
                      ? '1px solid var(--accent-emerald)'
                      : '1px solid var(--border-light)',
                    backgroundColor: isPlayground
                      ? 'rgba(16, 185, 129, 0.25)'
                      : 'var(--bg-input)',
                    color: isPlayground ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                    fontWeight: isPlayground ? 700 : 500,
                    fontSize: '10.5px',
                    cursor: 'pointer',
                  }}
                >
                  Plac zabaw
                </button>

                <button
                  type="button"
                  onClick={() => updateSelectedBuilding({ areaType: 'paved' })}
                  style={{
                    padding: '5px 6px',
                    borderRadius: '6px',
                    border: selectedBuilding.areaType === 'paved'
                      ? '1px solid var(--accent-slate, #94a3b8)'
                      : '1px solid var(--border-light)',
                    backgroundColor: selectedBuilding.areaType === 'paved'
                      ? 'rgba(148, 163, 184, 0.25)'
                      : 'var(--bg-input)',
                    color: selectedBuilding.areaType === 'paved' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: selectedBuilding.areaType === 'paved' ? 700 : 500,
                    fontSize: '10.5px',
                    cursor: 'pointer',
                  }}
                >
                  Utwardzenie
                </button>
              </div>
            </div>

            {isPlayground ? (
              <PlaygroundInspector
                building={selectedBuilding}
                buildingArea={selectedBuildingArea}
                playgroundAnalysis={playgroundAnalysis}
                sunlightMethod={sunlightMethod}
                onUpdate={updateSelectedBuilding}
              />
            ) : selectedBuilding.areaType === 'paved' ? (
              /* Nawierzchnia utwardzona */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(148, 163, 184, 0.12)',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Pow. utwardzona:</span>
                    <b style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {selectedBuildingArea.toFixed(1)} m²
                    </b>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    • Nawierzchnia nieprzepuszczalna (drogi, chodniki, place manewrowe) – odliczana od gruntu rodzimego.
                  </div>
                </div>
              </div>
            ) : (
              /* Działka */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    Numer działki
                  </label>
                  <input
                    type="text"
                    placeholder="np. 124/2"
                    value={selectedBuilding.plotNumber || ''}
                    onChange={(e) => updateSelectedBuilding({ plotNumber: e.target.value })}
                    style={{
                      width: '110px',
                      backgroundColor: 'var(--bg-input)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      padding: '6px 8px',
                      color: 'var(--accent-rose)',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      textAlign: 'right',
                    }}
                  />
                </div>

                {selectedBuilding.plotId && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      Identyfikator działki
                    </label>
                    <div
                      title="Kliknij, aby skopiować pełny identyfikator TERYT"
                      onClick={() => {
                        if (selectedBuilding.plotId) {
                          navigator.clipboard?.writeText(selectedBuilding.plotId);
                        }
                      }}
                      style={{
                        maxWidth: '180px',
                        backgroundColor: 'var(--bg-card-hover)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        textAlign: 'right',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        cursor: 'copy',
                        userSelect: 'all',
                      }}
                    >
                      {selectedBuilding.plotId}
                    </div>
                  </div>
                )}

                {selectedBuilding.landUseClass && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      Przeznaczenie / użytek
                    </label>
                    <div
                      style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        backgroundColor: selectedBuilding.landUseType === 'road' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                        border: `1px solid ${selectedBuilding.landUseType === 'road' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(234, 179, 8, 0.35)'}`,
                        color: selectedBuilding.landUseType === 'road' ? 'var(--accent-cyan)' : 'var(--accent-amber)',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {selectedBuilding.landUseClass} {selectedBuilding.landUseType ? `(${selectedBuilding.landUseType === 'road' ? 'Drogowa' : selectedBuilding.landUseType === 'residential' ? 'Mieszkaniowa' : selectedBuilding.landUseType === 'commercial' ? 'Usługowa/Przemysłowa' : selectedBuilding.landUseType === 'agricultural' ? 'Rolna' : selectedBuilding.landUseType === 'forest' ? 'Leśna' : 'Inna'})` : ''}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Powierzchnia działki:</span>
                    <b style={{ color: 'var(--accent-rose)', fontFamily: 'monospace' }}>
                      {selectedBuildingArea.toFixed(1)} m² ({(selectedBuildingArea / 100).toFixed(2)} a)
                    </b>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    • Obrys geodezyjny (nie generuje cienia i kierunków śledzenia fasad).
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {!isBalcony && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Typ budynku
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => updateSelectedBuilding({ buildingType: 'residential' })}
                    style={{
                      padding: '5px 6px',
                      borderRadius: '6px',
                      border: !selectedBuilding.buildingType || selectedBuilding.buildingType === 'residential'
                        ? '1px solid var(--accent-indigo)'
                        : '1px solid var(--border-light)',
                      backgroundColor: !selectedBuilding.buildingType || selectedBuilding.buildingType === 'residential'
                        ? 'rgba(99, 102, 241, 0.25)'
                        : 'var(--bg-input)',
                      color: !selectedBuilding.buildingType || selectedBuilding.buildingType === 'residential'
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                      fontWeight: !selectedBuilding.buildingType || selectedBuilding.buildingType === 'residential' ? 700 : 500,
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    Mieszkalny
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSelectedBuilding({ buildingType: 'service' })}
                    style={{
                      padding: '5px 6px',
                      borderRadius: '6px',
                      border: selectedBuilding.buildingType === 'service'
                        ? '1px solid var(--accent-amber)'
                        : '1px solid var(--border-light)',
                      backgroundColor: selectedBuilding.buildingType === 'service'
                        ? 'rgba(245, 158, 11, 0.25)'
                        : 'var(--bg-input)',
                      color: selectedBuilding.buildingType === 'service' ? 'var(--accent-amber)' : 'var(--text-secondary)',
                      fontWeight: selectedBuilding.buildingType === 'service' ? 700 : 500,
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    Usługowy
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSelectedBuilding({ buildingType: 'garage' })}
                    style={{
                      padding: '5px 6px',
                      borderRadius: '6px',
                      border: selectedBuilding.buildingType === 'garage'
                        ? '1px solid var(--border-light)'
                        : '1px solid var(--border-light)',
                      backgroundColor: selectedBuilding.buildingType === 'garage'
                        ? 'rgba(100, 116, 139, 0.25)'
                        : 'var(--bg-input)',
                      color: selectedBuilding.buildingType === 'garage' ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: selectedBuilding.buildingType === 'garage' ? 700 : 500,
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    Garaż
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Wysokość H (m)
              </label>
              <input
                type="number"
                step="0.5"
                value={selectedBuilding.defaultHeight}
                onChange={(e) =>
                  updateSelectedBuilding({
                    defaultHeight: parseFloat(e.target.value) || 0,
                    heightSource: 'manual',
                  })
                }
                style={{
                  width: '80px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  textAlign: 'right',
                }}
              />
            </div>

            {/* Posadowienie / Rzędna dolnej krawędzi Hbase */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Posadowienie H_base (m)
              </label>
              <input
                type="number"
                step="0.5"
                value={selectedBuilding.elevation ?? 0}
                onChange={(e) => updateSelectedBuilding({ elevation: parseFloat(e.target.value) || 0 })}
                style={{
                  width: '80px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  textAlign: 'right',
                }}
              />
            </div>

            {/* Parametry Wstęgi (jeśli dotyczy) */}
            <SweepParamsInspector building={selectedBuilding} onUpdate={updateSelectedBuilding} />

            {/* Kondygnacje */}
            <BuildingFloorsInspector building={selectedBuilding} onUpdate={updateSelectedBuilding} />

            {/* Obrót */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Obrót (°)
              </label>
              <input
                type="number"
                step="1"
                value={currentRotDeg}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  handleSetBuildingAbsoluteRotation(selectedBuilding.id, val);
                }}
                style={{
                  width: '80px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  color: 'var(--accent-indigo)',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  textAlign: 'right',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          </div>
        )}

        {/* Zunifikowany blok przełączników obok siebie (4 dla dzialek/budynkow — z "Inwestycja towarzysząca") */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${
              selectedBuilding.category === 'boundary' || selectedBuilding.category === 'building' ? 4 : 3
            }, 1fr)`,
            gap: '4px',
            marginTop: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => updateSelectedBuilding({ isIncluded: selectedBuilding.isIncluded === false ? true : false })}
            className={`btn-tile ${selectedBuilding.isIncluded !== false ? 'active-emerald' : 'inactive'}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '6px 4px',
              textAlign: 'center',
              minHeight: '48px',
            }}
            title="Dodaj obiekt jako przeszkodę do analiz §12 i §56, nawet jeśli nie jest w projekcie — nie wpływa na cień ani parametry"
          >
            <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Dodaj do analiz</span>
            <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
              {selectedBuilding.isIncluded !== false ? 'TAK' : 'NIE'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !selectedBuilding.isTested;
              updateSelectedBuilding({
                isTested: next,
                isAccompanyingInvestment: next ? false : selectedBuilding.isAccompanyingInvestment,
              });
            }}
            className={`btn-tile ${selectedBuilding.isTested ? 'active-indigo' : 'inactive'}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '6px 4px',
              textAlign: 'center',
              minHeight: '48px',
            }}
            title="Oznacz obiekt jako część projektowanego zamierzenia — wlicza się do cienia i parametrów"
          >
            <span style={{ fontSize: '10px', lineHeight: '1.2' }}>W projekcie</span>
            <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
              {selectedBuilding.isTested ? 'TAK' : 'NIE'}
            </span>
          </button>

          {(selectedBuilding.category === 'boundary' || selectedBuilding.category === 'building') && (
            <button
              type="button"
              onClick={() => {
                const next = !selectedBuilding.isAccompanyingInvestment;
                updateSelectedBuilding({
                  isAccompanyingInvestment: next,
                  isTested: next ? false : selectedBuilding.isTested,
                });
              }}
              className={`btn-tile ${selectedBuilding.isAccompanyingInvestment ? 'active-blue' : 'inactive'}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '6px 4px',
                textAlign: 'center',
                minHeight: '48px',
              }}
              title="Oznacz obiekt jako inwestycję towarzyszącą — status rozłączny z „W projekcie”"
            >
              <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Inwestycja towarzysząca</span>
              <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
                {selectedBuilding.isAccompanyingInvestment ? 'TAK' : 'NIE'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => updateSelectedBuilding({ isCityCentre: !selectedBuilding.isCityCentre })}
            className={`btn-tile ${selectedBuilding.isCityCentre ? 'active-amber' : 'inactive'}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '6px 4px',
              textAlign: 'center',
              minHeight: '48px',
            }}
            title="Włącz normę zabudowy śródmiejskiej dla obiektu"
          >
            <span style={{ fontSize: '10px', lineHeight: '1.2' }}>Zabudowa śródmiejska</span>
            <span style={{ fontSize: '9.5px', fontWeight: 700 }}>
              {selectedBuilding.isCityCentre ? 'TAK' : 'NIE'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
