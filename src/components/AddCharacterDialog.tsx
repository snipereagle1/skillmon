import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let unlistenFn: (() => void) | null = null;
    const setupAuthListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen("auth-success", () => {
          setAuthUrl(null);
          setError(null);
          setIsLoading(false);
          onOpenChange(false);
          if (onSuccess) {
            onSuccess();
          }
        });
        unlistenFn = unlisten;
      } catch (error) {
        console.error("Failed to setup auth listener:", error);
      }
    };

    setupAuthListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [open, onOpenChange, onSuccess]);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    setAuthUrl(null);
    try {
      const result = await invoke<string>("start_eve_login");
      const urlMatch = result.match(/https:\/\/[^\s]+/);
      if (urlMatch) {
        setAuthUrl(urlMatch[0]);
      } else {
        setAuthUrl(result);
      }
    } catch (err: any) {
      const errorMessage = err?.message || err?.toString() || "Failed to start login";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy:", err);
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
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Opening browser..." : "Login with EVE Online"}
          </Button>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
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
                Open this URL in your browser to authenticate. After logging in, you'll be redirected back automatically.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

