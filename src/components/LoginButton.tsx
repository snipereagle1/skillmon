import { useState } from 'react';

import { useStartEveLogin } from '@/hooks/tauri/useStartEveLogin';

export function LoginButton() {
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const loginMutation = useStartEveLogin();

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
    <div className="space-y-3">
      <button
        onClick={handleLogin}
        disabled={loginMutation.isPending}
        className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
      >
        {loginMutation.isPending
          ? 'Opening browser...'
          : 'Login with EVE Online'}
      </button>
      {loginMutation.isError && (
        <p className="text-destructive mt-2">
          {loginMutation.error instanceof Error
            ? loginMutation.error.message
            : 'Failed to start login'}
        </p>
      )}
      {authUrl && (
        <div className="mt-4 p-4 bg-card rounded border border-border">
          <p className="text-sm font-semibold mb-2 text-foreground">
            Authentication URL:
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={authUrl}
              className="flex-1 px-3 py-2 bg-muted border border-border rounded text-sm font-mono"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={() => copyToClipboard(authUrl)}
              className="px-3 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded text-sm"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Open this URL in your browser to authenticate with EVE Online. After
            logging in, you&apos;ll be redirected back automatically.
          </p>
        </div>
      )}
    </div>
  );
}
