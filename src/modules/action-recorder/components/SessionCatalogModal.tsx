// src/modules/action-recorder/components/SessionCatalogModal.tsx
// Modal Katalogu Nagrań i Sesji Działań

import React, { useEffect, useState } from 'react';
import {
  X,
  Play,
  Download,
  Trash2,
  Upload,
  Video,
  FileJson,
  Clock,
  Layers,
  FolderOpen,
} from 'lucide-react';
import { useActionRecorderStore } from '../useActionRecorderStore';
import {
  getAllCatalogItems,
  getSession,
  getVideoBlob,
  deleteRecording,
  saveRecording,
  downloadBlob,
  downloadJson,
} from '../actionRecorderStorage';
import { ActionReplayer } from '../ActionReplayer';
import { CatalogItem, ActionSession } from '../types';

export const SessionCatalogModal: React.FC = () => {
  const isCatalogOpen = useActionRecorderStore((s) => s.isCatalogOpen);
  const setIsCatalogOpen = useActionRecorderStore((s) => s.setIsCatalogOpen);

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadItems = async () => {
    setLoading(true);
    try {
      const list = await getAllCatalogItems();
      setItems(list);
    } catch (err) {
      console.error('[SessionCatalog] Błąd ładowania nagrań:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isCatalogOpen) {
      loadItems();
    }
  }, [isCatalogOpen]);

  if (!isCatalogOpen) return null;

  const handleReplay = async (id: string) => {
    const session = await getSession(id);
    if (!session) return;
    setIsCatalogOpen(false);
    ActionReplayer.getInstance().loadSession(session);
    ActionReplayer.getInstance().play();
  };

  const handleDownloadVideo = async (id: string, title: string) => {
    const blob = await getVideoBlob(id);
    if (blob) {
      downloadBlob(blob, `${title.replace(/\s+/g, '_')}.webm`);
    }
  };

  const handleDownloadJson = async (id: string, title: string) => {
    const session = await getSession(id);
    if (session) {
      downloadJson(session, `${title.replace(/\s+/g, '_')}.json`);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Czy na pewno chcesz usunąć to nagranie z katalogu?')) {
      await deleteRecording(id);
      loadItems();
    }
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const session = JSON.parse(text) as ActionSession;
        if (!session.id || !session.events) {
          alert('Nieprawidłowy format pliku sesji');
          return;
        }
        await saveRecording(session);
        loadItems();
      } catch (err) {
        alert('Błąd podczas importu pliku JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const formatDuration = (ms: number) => {
    const sec = (ms / 1000).toFixed(1);
    return `${sec}s`;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(2, 6, 23, 0.75)',
        backdropFilter: 'blur(12px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="ui-card"
        style={{
          width: '740px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
          border: '1px solid var(--border-light)',
        }}
      >
        {/* Nagłówek Modalu */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '14px',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FolderOpen size={20} color="var(--accent-blue)" />
            <h2
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              Katalog Nagrań i Sesji
            </h2>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                background: 'var(--bg-input)',
                color: 'var(--text-secondary)',
              }}
            >
              {items.length} {items.length === 1 ? 'pozycja' : 'pozycji'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label
              className="btn-secondary"
              style={{
                margin: 0,
                padding: '6px 10px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
              title="Wgraj plik sesji JSON z dysku"
            >
              <Upload size={13} />
              <span>Importuj sesję JSON</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJson}
                style={{ display: 'none' }}
              />
            </label>

            <button
              type="button"
              onClick={() => setIsCatalogOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Lista nagrań */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingRight: '4px',
          }}
        >
          {loading && (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
              Ładowanie nagrań...
            </div>
          )}

          {!loading && items.length === 0 && (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                background: 'var(--bg-input)',
                borderRadius: '12px',
                border: '1px dashed var(--border-color)',
              }}
            >
              <Video size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Brak zapisanych nagrań
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Użyj skrótu <strong>~</strong> (tylda) lub przycisku w kafelku Narzędzia deweloperskie, aby nagrać własne działanie.
              </div>
            </div>
          )}

          {!loading &&
            items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--bg-input)',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  gap: '12px',
                }}
              >
                {/* Szczegóły sesji */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.title}
                    </span>
                    <span
                      style={{
                        fontSize: '9.5px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: 'var(--border-color)',
                        color: 'var(--accent-cyan)',
                        fontWeight: 600,
                      }}
                    >
                      {item.aspectRatio}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={11} /> {formatDuration(item.durationMs)}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Layers size={11} /> {item.eventCount} operacji
                    </span>
                    <span>
                      {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                    {item.videoBlobSize && (
                      <span>{(item.videoBlobSize / 1024 / 1024).toFixed(1)} MB (WebM)</span>
                    )}
                  </div>
                </div>

                {/* Przyciski Akcji */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {/* Replay */}
                  <button
                    type="button"
                    onClick={() => handleReplay(item.id)}
                    className="btn-primary"
                    style={{
                      padding: '6px 10px',
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                    title="Odtwórz sesję na żywo w aplikacji"
                  >
                    <Play size={12} />
                    <span>Odtwórz</span>
                  </button>

                  {/* Pobierz WebM */}
                  {item.hasVideo && (
                    <button
                      type="button"
                      onClick={() => handleDownloadVideo(item.id, item.title)}
                      className="btn-secondary"
                      style={{
                        padding: '6px 8px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                      title="Pobierz plik wideo WebM"
                    >
                      <Video size={12} />
                      <span>WebM</span>
                    </button>
                  )}

                  {/* Pobierz JSON */}
                  <button
                    type="button"
                    onClick={() => handleDownloadJson(item.id, item.title)}
                    className="btn-secondary"
                    style={{
                      padding: '6px 8px',
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                    title="Pobierz dane sesji JSON"
                  >
                    <FileJson size={12} />
                    <span>JSON</span>
                  </button>

                  {/* Usuń */}
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    style={{
                      padding: '6px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Usuń nagranie"
                  >
                    <Trash2 size={13} color="var(--accent-rose)" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
