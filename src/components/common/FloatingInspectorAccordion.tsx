import React from 'react';

interface FloatingInspectorAccordionProps {
  children: React.ReactNode;
  width?: string | number;
  top?: string | number;
  right?: string | number;
}

export const FloatingInspectorAccordion: React.FC<FloatingInspectorAccordionProps> = ({
  children,
  width = 360,
  top = '70px',
  right = '20px',
}) => {
  const validChildren = React.Children.toArray(children).filter(Boolean);
  if (validChildren.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: typeof top === 'number' ? `${top}px` : top,
        right: typeof right === 'number' ? `${right}px` : right,
        width: typeof width === 'number' ? `${width}px` : width,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 50,
        pointerEvents: 'auto',
      }}
    >
      {children}
    </div>
  );
};
