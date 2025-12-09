import { useState } from "react";
import { useStartEveLogin } from "@/hooks/tauri/useStartEveLogin";

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
    } catch (err) {
      // Error is handled by react-query and displayed via loginMutation.error
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
    <div className="space-y-3">
      <button
        onClick={handleLogin}
        disabled={loginMutation.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loginMutation.isPending ? "Opening browser..." : "Login with EVE Online"}
      </button>
      {loginMutation.isError && (
        <p className="text-red-600 mt-2">
          {loginMutation.error instanceof Error ? loginMutation.error.message : "Failed to start login"}
        </p>
      )}
      {authUrl && (
        <div className="mt-4 p-4 bg-gray-100 rounded border border-gray-300">
          <p className="text-sm font-semibold mb-2 text-gray-700">Authentication URL:</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={authUrl}
              className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-sm font-mono"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={() => copyToClipboard(authUrl)}
              className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Open this URL in your browser to authenticate with EVE Online. After logging in, you'll be redirected back automatically.
          </p>
        </div>
      )}
    </div>
  );
}


