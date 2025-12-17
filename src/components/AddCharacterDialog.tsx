import { useState, useEffect } from 'react';
import { useStartEveLogin } from '@/hooks/tauri/useStartEveLogin';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface AddCharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddCharacterDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddCharacterDialogProps) {
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const loginMutation = useStartEveLogin();

  useEffect(() => {
    if (!open) return;

    let unlistenFn: (() => void) | null = null;
    const setupAuthListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen('auth-success', () => {
          setAuthUrl(null);
          loginMutation.reset();
          onOpenChange(false);
          if (onSuccess) {
            onSuccess();
          }
        });
        unlistenFn = unlisten;
      } catch (error) {
        console.error('Failed to setup auth listener:', error);
      }
    };

    setupAuthListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [open, onOpenChange, onSuccess, loginMutation]);

  const handleLogin = async () => {
    setAuthUrl(null);
    try {
      const result = await loginMutation.mutateAsync();
      const urlMatch = result.match(/https:\/\/[^\s]+/);
      if (urlMatch) {
        setAuthUrl(urlMatch[0]);
      } else {
        setAuthUrl(result);
      }
    } catch (err) {
      // Error is handled by react-query and displayed via loginMutation.error
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Character</DialogTitle>
          <DialogDescription>
            Authenticate with EVE Online to add a character to your account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Button
            onClick={handleLogin}
            disabled={loginMutation.isPending}
            className="w-full"
          >
            {loginMutation.isPending
              ? 'Opening browser...'
              : 'Login with EVE Online'}
          </Button>
          {loginMutation.isError && (
            <p className="text-sm text-destructive">
              {loginMutation.error instanceof Error
                ? loginMutation.error.message
                : 'Failed to start login'}
            </p>
          )}
          {authUrl && (
            <div className="space-y-2 p-4 bg-muted rounded-md">
              <p className="text-sm font-semibold">Authentication URL:</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={authUrl}
                  className="flex-1 px-3 py-2 bg-background border rounded text-sm font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(authUrl)}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Open this URL in your browser to authenticate. After logging in,
                you'll be redirected back automatically.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
