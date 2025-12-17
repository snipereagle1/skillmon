import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export function useAuthEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        const unlistenSuccess = await listen<number>(
          'auth-success',
          async (event) => {
            const characterId = event.payload;
            await queryClient.invalidateQueries({
              queryKey: ['skillQueue', characterId],
            });
            await queryClient.invalidateQueries({
              queryKey: ['characterSkills', characterId],
            });
            await queryClient.invalidateQueries({
              queryKey: ['attributes', characterId],
            });
            await queryClient.invalidateQueries({
              queryKey: ['clones', characterId],
            });
            await queryClient.invalidateQueries({ queryKey: ['characters'] });
          }
        );

        const unlistenError = await listen<string>('auth-error', (event) => {
          console.error('Auth error:', event.payload);
        });

        cleanup = () => {
          unlistenSuccess();
          unlistenError();
        };
      } catch (error) {
        console.error('Failed to setup auth listeners:', error);
        if (error instanceof Error && error.message.includes('Tauri')) {
          console.log('Not in Tauri environment (expected in browser dev)');
        }
      }
    };

    setup();
    return () => cleanup?.();
  }, [queryClient]);
}
