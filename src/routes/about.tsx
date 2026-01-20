import { createFileRoute } from '@tanstack/react-router';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { Download, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUpdateStore } from '@/stores/updateStore';

function AboutPage() {
  const [version, setVersion] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  const { update, updateAvailable, setUpdate } = useUpdateStore();

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

  const handleCheckUpdate = async () => {
    setChecking(true);
    try {
      const result = await check();
      setUpdate(result);
      if (!result) {
        toast.info('You are on the latest version');
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      toast.error('Failed to check for updates');
    } finally {
      setChecking(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!update) return;

    setDownloading(true);
    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(
                Math.round((downloaded / contentLength) * 100)
              );
            }
            break;
          case 'Finished':
            setDownloading(false);
            setDownloadProgress(null);
            break;
        }
      });

      toast.success('Update installed, restarting...');
      await relaunch();
    } catch (error) {
      console.error('Failed to install update:', error);
      toast.error('Failed to install update');
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-8 p-8 max-w-2xl mx-auto overflow-y-auto h-full">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            About Skillmon
          </h2>
          <p className="text-muted-foreground text-lg">
            A modern EVE Online skill monitoring and planning application.
          </p>
        </div>
        <img src="/skillmon.svg" alt="Skillmon Logo" className="w-16 h-16" />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h3 className="text-lg font-medium">Version</h3>
            <p className="text-muted-foreground font-mono">
              {version || 'Loading...'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckUpdate}
            disabled={checking || downloading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', checking && 'animate-spin')} />
            Check for updates
          </Button>
        </div>

        {updateAvailable && update && (
          <div className="bg-accent/50 rounded-lg p-4 border border-green-500/20 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-green-600 dark:text-green-400">
                  New Version Available: v{update.version}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Released on {new Date(update.date || '').toLocaleDateString()}
                </p>
              </div>
              <Button
                onClick={handleInstallUpdate}
                disabled={downloading}
                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                <Download className="h-4 w-4" />
                {downloading ? 'Downloading...' : 'Install Update'}
              </Button>
            </div>

            {downloading && downloadProgress !== null && (
              <div className="space-y-2">
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  {downloadProgress}% downloaded
                </p>
              </div>
            )}

            {update.body && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  What&apos;s New
                </h4>
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none bg-background/50 rounded p-3 border whitespace-pre-wrap">
                  {update.body}
                </div>
              </div>
            )}
          </div>
        )}

        {!updateAvailable && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            You&apos;re up to date
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/about')({
  component: AboutPage,
});
