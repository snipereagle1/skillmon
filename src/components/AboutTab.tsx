import { getVersion } from '@tauri-apps/api/app';
import { useEffect, useState } from 'react';

export function AboutTab() {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error('Failed to get app version:', error);
        if (error instanceof Error && error.message.includes('Tauri')) {
          setVersion('dev');
        }
      }
    };

    fetchVersion();
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-2xl font-semibold mb-2">About Skillmon</h2>
        <p className="text-muted-foreground">
          EVE Online skill monitoring application
        </p>
      </div>
      <div>
        <h3 className="text-lg font-medium mb-2">Version</h3>
        <p className="text-muted-foreground">{version || 'Loading...'}</p>
      </div>
      <div>
        <h3 className="text-lg font-medium mb-2">Release Notes</h3>
        <p className="text-muted-foreground">
          Release notes will be displayed here in future updates.
        </p>
      </div>
    </div>
  );
}
