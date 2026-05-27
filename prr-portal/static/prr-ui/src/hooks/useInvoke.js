import { invoke } from '@forge/bridge';
import { useState, useCallback } from 'react';

/**
 * useInvoke
 * Thin wrapper around @forge/bridge invoke for use in components.
 */
export function useInvoke(fnName) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const call = useCallback(
    async (payload) => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke(fnName, payload);
        return result;
      } catch (err) {
        setError(err.message || String(err));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fnName]
  );

  return { call, loading, error };
}
