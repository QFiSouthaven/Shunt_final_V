// components/mia/MiaAssistant.tsx
import React, { useState, useEffect, useCallback } from 'react';
import MiaPanel from './MiaPanel';

const MiaAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const togglePanel = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const miaContainer = document.getElementById('mia-assistant-container');
      if (miaContainer && !miaContainer.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div id="mia-assistant-container" className="mia-assistant-container">
      {isOpen && <MiaPanel onClose={togglePanel} />}
      <button
        className={`mia-toggle-button ${isOpen ? 'open' : ''}`}
        onClick={togglePanel}
        aria-label={isOpen ? 'Close Mia Assistant' : 'Open Mia Assistant'}
      >
        {isOpen ? '❌' : '💬'}
      </button>
    </div>
  );
};

export default MiaAssistant;