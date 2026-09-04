import React from 'react';
import {
  Sun,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Layers,
  Wrench,
} from 'lucide-react';
import { useUiStore } from '../../store';
import { ProjectGroup } from './ProjectGroup';
import { LayersAndObjectsGroup } from './LayersAndObjectsGroup';
import { ToolsGroup } from './ToolsGroup';

export const AppSidebar: React.FC = () => {
  const isSidebarOpen = useUiStore((s) => s.isSidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const openSidebarGroup = useUiStore((s) => s.openSidebarGroup);
  const toggleSidebarGroup = useUiStore((s) => s.toggleSidebarGroup);

  const isProjectGroupOpen = openSidebarGroup === 'project';
  const isLayersGroupOpen = openSidebarGroup === 'layers';
  const isToolsGroupOpen = openSidebarGroup === 'tools';

  return (
    <aside className={`app-sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '7px',
              borderRadius: '9px',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sun size={20} color="#38bdf8" />
          </div>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#fff', letterSpacing: '0.3px' }}>
              Światło
            </div>
          </div>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          title="Schowaj panel boczny"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '6px',
          }}
        >
          <ChevronLeft size={20} />
        </button>
      </div>

      {/* Scrollable Body with Collapsible Groups */}
      <div className="sidebar-body custom-scrollbar">
        {/* GRUPA 1: PROJEKT */}
        <div className="sidebar-group">
          <button
            type="button"
            className="sidebar-group-header"
            onClick={() => toggleSidebarGroup('project')}
            title="Zwiń / rozwiń grupę: Projekt"
          >
            <div className="sidebar-group-title">
              <FolderKanban size={15} color="#f59e0b" />
              <span>Projekt</span>
            </div>
            {isProjectGroupOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
          </button>

          {isProjectGroupOpen && <ProjectGroup />}
        </div>

        {/* GRUPA 2: WARSTWY I OBIEKTY */}
        <div className="sidebar-group-divider" />
        <div className="sidebar-group">
          <button
            type="button"
            className="sidebar-group-header"
            onClick={() => toggleSidebarGroup('layers')}
            title="Zwiń / rozwiń grupę: Warstwy i obiekty"
          >
            <div className="sidebar-group-title">
              <Layers size={15} color="#38bdf8" />
              <span>Warstwy i obiekty</span>
            </div>
            {isLayersGroupOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
          </button>

          {isLayersGroupOpen && <LayersAndObjectsGroup />}
        </div>

        {/* GRUPA 3: NARZĘDZIA */}
        <div className="sidebar-group-divider" />
        <div className="sidebar-group">
          <button
            type="button"
            className="sidebar-group-header"
            onClick={() => toggleSidebarGroup('tools')}
            title="Zwiń / rozwiń grupę: Narzędzia"
          >
            <div className="sidebar-group-title">
              <Wrench size={15} color="#818cf8" />
              <span>Narzędzia</span>
            </div>
            {isToolsGroupOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
          </button>

          {isToolsGroupOpen && <ToolsGroup />}
        </div>
      </div>
    </aside>
  );
};
