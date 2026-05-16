
// components/mia/MiaAlerts.tsx
import React from 'react';
import { useMiaContext } from '../../../styles/services/context/MiaContext';

const MiaAlerts: React.FC = () => {
  const { alerts, clearAlerts } = useMiaContext();

  const handleAlertAction = (actionType: string, payload?: any) => {
    switch (actionType) {
      case 'clear_all':
        clearAlerts();
        break;
      default:
        alert(`Action: ${actionType}`);
    }
  };

  return (
    <div className="mia-alerts-container">
      {alerts.length === 0 ? (
        <p className="mia-alerts-empty">No new alerts from Mia.</p>
      ) : (
        alerts.map(alert => (
          <div key={alert.id} className={`mia-alert-card ${alert.severity}`}>
            <div className="mia-alert-header">
              <h4>{alert.title}</h4>
              <span className={`mia-alert-severity ${alert.severity}`}>{alert.severity}</span>
            </div>
            <p className="mia-alert-message">{alert.message}</p>
            {alert.context && (
              <details className="mia-alert-context">
                <summary>Context</summary>
                <pre>{JSON.stringify(alert.context, null, 2)}</pre>
              </details>
            )}
            {alert.actions && (
              <div className="mia-alert-actions">
                {alert.actions.map((action, index) => (
                  <button key={index} onClick={() => handleAlertAction(action.actionType, { ...action.payload, alertId: alert.id })}>
                    {action.label}
                  </button>
                ))}
              </div>
            )}
            <span className="mia-alert-timestamp">{new Date(alert.timestamp).toLocaleString()}</span>
          </div>
        ))
      )}
    </div>
  );
};

export default MiaAlerts;
