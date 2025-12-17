import { useEffect, useState } from 'react';

import { isStartupComplete } from '@/generated/commands';

export function useStartupState() {
  const [isStartingUp, setIsStartingUp] = useState(true);

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    const setup = async () => {
      try {
        // Check initial startup status
        const initialStatus = await isStartupComplete();
        setIsStartingUp(!initialStatus);

        // If already complete, no need to listen for events
        if (initialStatus) {
          return;
        }

        // Listen for startup-complete event
        const { listen } = await import('@tauri-apps/api/event');

        const unlisten = await listen('startup-complete', () => {
          setIsStartingUp(false);
        });

        cleanup = () => {
          unlisten();
        };
      } catch (error) {
        console.error('Failed to setup startup state listener:', error);
        if (error instanceof Error && error.message.includes('Tauri')) {
          console.log('Not in Tauri environment (expected in browser dev)');
          // In browser dev mode, assume startup is complete
          setIsStartingUp(false);
        }
      }
    };

    setup();
    return () => cleanup?.();
  }, []);

  return { isStartingUp };
}
