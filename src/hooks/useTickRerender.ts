import { useEffect, useState } from 'react';

export function useTickRerender(intervalMs = 1000): void {
  const [, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
