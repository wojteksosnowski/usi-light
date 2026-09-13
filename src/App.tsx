import React from 'react';
import { AppLayout } from './app/AppLayout';
import { ModalHost } from './app/ModalHost';
import { useAppBootstrap } from './app/hooks/useAppBootstrap';
import { useGlobalShortcuts } from './app/hooks/useGlobalShortcuts';

export const App: React.FC = () => {
  const {
    loadStatus,
    dismissStatus,
    currentAccuracyOptions,
    effectiveBuildings,
    analysisOutput,
  } = useAppBootstrap();

  useGlobalShortcuts();

  return (
    <>
      <AppLayout
        currentAccuracyOptions={currentAccuracyOptions}
        effectiveBuildings={effectiveBuildings}
        analysisOutput={analysisOutput}
        loadStatus={loadStatus}
        onDismissStatus={dismissStatus}
      />
      <ModalHost />
    </>
  );
};

export default App;
