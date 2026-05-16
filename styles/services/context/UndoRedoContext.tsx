// context/UndoRedoContext.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface UndoRedoActions {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

interface UndoRedoContextType extends UndoRedoActions {
    register: (actions: UndoRedoActions) => void;
    unregister: () => void;
}

const defaultActions: UndoRedoActions = {
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
};

const UndoRedoContext = createContext<UndoRedoContextType | undefined>(undefined);

export const UndoRedoProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [actions, setActions] = useState<UndoRedoActions>(defaultActions);

    const register = useCallback((newActions: UndoRedoActions) => {
        setActions(newActions);
    }, []);
    
    const unregister = useCallback(() => {
        setActions(defaultActions);
    }, []);
    
    const value = { ...actions, register, unregister };

    return (
        <UndoRedoContext.Provider value={value}>
            {children}
        </UndoRedoContext.Provider>
    );
};

export const useUndoRedoContext = (): UndoRedoContextType => {
    const context = useContext(UndoRedoContext);
    if (!context) {
        throw new Error('useUndoRedoContext must be used within an UndoRedoProvider');
    }
    return context;
};
