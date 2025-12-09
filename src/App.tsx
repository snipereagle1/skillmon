import { useEffect } from "react";
import { LoginButton } from "./components/LoginButton";
import { CharacterList } from "./components/CharacterList";
import "./App.css";

function App() {
  useEffect(() => {
    const setupAuthListeners = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        console.log("App: Setting up auth-success listener...");

        const unlistenSuccess = await listen<number>("auth-success", (event) => {
          console.log("App: ===== AUTH SUCCESS EVENT RECEIVED =====");
          console.log("App: Full event object:", JSON.stringify(event, null, 2));
          console.log("App: Character ID:", event.payload);
          // CharacterList component will handle refreshing itself
        });

        console.log("App: Auth listener set up successfully");

        const unlistenError = await listen<string>("auth-error", (event) => {
          console.error("Auth error:", event.payload);
          alert(`Authentication error: ${event.payload}`);
        });

        return () => {
          unlistenSuccess();
          unlistenError();
        };
      } catch (error) {
        console.error("App: Failed to setup auth listeners:", error);
        // If we're not in Tauri, this is expected - just log and continue
        if (error instanceof Error && error.message.includes("Tauri")) {
          console.log("App: Not in Tauri environment (expected in browser dev)");
        }
      }
    };

    setupAuthListeners();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">SkillMon - EVE Online Character Training Monitor</h1>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Authentication</h2>
            <LoginButton />
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <CharacterList />
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
