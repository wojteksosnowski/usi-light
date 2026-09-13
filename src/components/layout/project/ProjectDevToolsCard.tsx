import React from 'react';
import { Upload, Download, Wrench } from 'lucide-react';
import { useProjectIO } from './hooks/useProjectIO';

export const ProjectDevToolsCard: React.FC = () => {
  const { handleSceneFileUpload, handleSceneDownload } = useProjectIO();

  const isLocalhost = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    const host = window.location.host;
    const hostname = window.location.hostname;
    return (
      host === 'localhost:3000' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      Boolean((import.meta as any).env?.DEV)
    );
  }, []);

  if (!isLocalhost) {
    return null;
  }

  return (
    <div className="ui-card">
      <div className="ui-title">
        <span>Narzędzia deweloperskie</span>
        <Wrench size={14} color="var(--text-secondary)" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
        <label
          className="btn-primary"
          style={{
            margin: 0,
            padding: '8px 4px',
            fontSize: '10.5px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            textAlign: 'center',
            cursor: 'pointer',
          }}
          title="Wgraj scenę JSON"
        >
          <Upload size={14} />
          <span>Wgraj scenę</span>
          <input type="file" accept=".json" onChange={handleSceneFileUpload} style={{ display: 'none' }} />
        </label>

        <button
          type="button"
          onClick={handleSceneDownload}
          className="btn-secondary"
          style={{
            padding: '8px 4px',
            fontSize: '10.5px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            textAlign: 'center',
          }}
          title="Zapisz scenę JSON"
        >
          <Download size={14} />
          <span>Zapisz JSON</span>
        </button>
      </div>
    </div>
  );
};
