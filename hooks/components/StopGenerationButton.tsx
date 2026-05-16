import React, { useEffect, useState } from 'react';
import { appEventBus } from '@/lib/eventBus';
import { cancelAllGenerations, getInflightCount } from '@/styles/services/aiService';

const StopGenerationButton: React.FC = () => {
  const [count, setCount] = useState<number>(() => getInflightCount());

  useEffect(() => {
    const off = appEventBus.on('ai-inflight-changed', ({ count: n }) => setCount(n));
    return off;
  }, []);

  if (count <= 0) return null;

  const label = count === 1 ? 'Stop generating' : `Stop generating (${count})`;

  return (
    <button
      type="button"
      onClick={() => cancelAllGenerations()}
      title="Cancel all in-flight AI requests"
      style={{
        position: 'fixed',
        right: '1rem',
        bottom: '1rem',
        zIndex: 9999,
        padding: '0.55rem 0.95rem',
        borderRadius: '9999px',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        background: 'rgba(120, 50, 180, 0.92)',
        color: '#fff',
        font: '500 0.875rem/1 system-ui, -apple-system, sans-serif',
        cursor: 'pointer',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(180, 120, 255, 0.25)',
        backdropFilter: 'blur(6px)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '0.7rem',
          height: '0.7rem',
          background: '#fff',
          borderRadius: '2px',
        }}
      />
      {label}
    </button>
  );
};

export default StopGenerationButton;
