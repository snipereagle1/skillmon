import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useBaseScopeStrings,
  useEnabledFeatures,
  useOptionalFeatures,
} from '@/hooks/tauri/useSettings';
import { useStartEveLogin } from '@/hooks/tauri/useStartEveLogin';

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
  const { data: baseScopeStrings } = useBaseScopeStrings();
  const { data: optionalFeatures } = useOptionalFeatures();
  const { data: enabledFeatures } = useEnabledFeatures();

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
    } catch {
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
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Character</DialogTitle>
          <DialogDescription>
            Authenticate with EVE Online to add a character to your account. The
            following permissions will be requested:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Base Scopes Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              Base Permissions
            </h3>
            <p className="text-xs text-muted-foreground">
              These permissions are always required for core functionality:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {baseScopeStrings?.map((scope) => (
                <code
                  key={scope}
                  className="text-[10px] bg-muted px-1.5 py-0.5 rounded"
                >
                  {scope}
                </code>
              ))}
            </div>
          </div>

          {/* Optional Features Section */}
          {optionalFeatures && optionalFeatures.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Optional Features
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {enabledFeatures && enabledFeatures.length > 0
                      ? `${enabledFeatures.length} feature${enabledFeatures.length > 1 ? 's' : ''} enabled`
                      : 'No optional features enabled'}
                  </p>
                </div>
                <Link
                  to="/settings/features"
                  className="text-sm text-primary hover:underline"
                  onClick={() => onOpenChange(false)}
                >
                  Manage in Settings
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {optionalFeatures.map((feature) => {
                  const isEnabled = enabledFeatures?.includes(feature.id);
                  return (
                    <div
                      key={feature.id}
                      className={`p-3 border rounded-lg ${isEnabled ? 'bg-card' : 'bg-muted/30 opacity-60'}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {feature.name}
                          </span>
                          {isEnabled && (
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              Enabled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {feature.description}
                        </p>
                        {isEnabled && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {feature.scopes.map((scope) => (
                              <code
                                key={scope}
                                className="text-[10px] bg-muted px-1.5 py-0.5 rounded"
                              >
                                {scope}
                              </code>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Login Button */}
          <div className="pt-2 border-t flex justify-center">
            <Button onClick={handleLogin} disabled={loginMutation.isPending}>
              {loginMutation.isPending
                ? 'Opening browser...'
                : 'Login with EVE Online'}
            </Button>
          </div>

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
                you&apos;ll be redirected back automatically.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
