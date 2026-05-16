// hooks/useUndoRedo.ts
import { useState, useCallback, SetStateAction } from 'react';

type History<T> = {
  past: T[];
  present: T;
  future: T[];
};

export const useUndoRedo = <T>(initialPresent: T) => {
  const [state, setState] = useState<History<T>>({
    past: [],
    present: initialPresent,
    future: [],
  });

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  const undo = useCallback(() => {
    setState((current) => {
      const { past, present, future } = current;
      if (past.length === 0) return current;

      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);

      return {
        past: newPast,
        present: previous,
        future: [present, ...future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      const { past, present, future } = current;
      if (future.length === 0) return current;

      const next = future[0];
      const newFuture = future.slice(1);

      return {
        past: [...past, present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  const set = useCallback((newPresentOrFn: SetStateAction<T>) => {
    setState((current) => {
      const newPresent = typeof newPresentOrFn === 'function'
        ? (newPresentOrFn as (prevState: T) => T)(current.present)
        : newPresentOrFn;
      
      if (newPresent === current.present) return current;

      // FIX: Use structuredClone to ensure deep copy for immutability.
      // This prevents the 'past' state from being mutated if it shares references with 'current'.
      const currentSnapshot = typeof current.present === 'object' && current.present !== null 
        ? structuredClone(current.present) 
        : current.present;

      return {
        past: [...current.past, currentSnapshot],
        present: newPresent,
        future: [], // Clear future on new action
      };
    });
  }, []);
  
  const reset = useCallback((newPresent: T) => {
    setState({
        past: [],
        present: newPresent,
        future: [],
    });
  }, []);

  return {
    state: state.present,
    set,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
  };
};