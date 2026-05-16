import React from 'react';

type Status = 'Running' | 'Stopped' | 'Pending' | 'Error';

interface StatusIndicatorProps {
  status: Status;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
    switch (status) {
      case 'Running':
        return <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" title="Running"></div>;
      case 'Stopped':
        return <div className="w-2.5 h-2.5 rounded-full bg-red-400" title="Stopped"></div>;
      case 'Pending':
        return <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" title="Pending"></div>;
      case 'Error':
        return <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-1 ring-red-400" title="Error"></div>;
      default:
        return null;
    }
};

export default StatusIndicator;
