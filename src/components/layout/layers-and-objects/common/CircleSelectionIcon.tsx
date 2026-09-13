import React from 'react';
import { Circle } from 'lucide-react';

interface CircleSelectionIconProps {
  status: 'all' | 'partial' | 'none';
  size?: number;
}

export const CircleSelectionIcon: React.FC<CircleSelectionIconProps> = ({
  status,
  size = 12,
}) => {
  if (status === 'all') {
    return <Circle size={size} fill="var(--accent-cyan)" color="var(--accent-cyan)" />;
  }
  if (status === 'partial') {
    return (
      <Circle
        size={size}
        color="var(--accent-cyan)"
        fill="rgba(56, 189, 248, 0.4)"
      />
    );
  }
  return <Circle size={size} color="var(--text-muted)" />;
};
