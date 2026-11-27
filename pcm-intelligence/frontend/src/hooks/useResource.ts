import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "../services/api";
export function useResource<T>(path: string) {
  const previousPath = useRef(path);
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    if (previousPath.current !== path) setData(null);
    previousPath.current = path;
    api(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  return { data, error, loading, refresh };
}
