import { useEffect } from "react";
import { TabLayout } from "./components/TabLayout";

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
        if (error instanceof Error && error.message.includes("Tauri")) {
          console.log("App: Not in Tauri environment (expected in browser dev)");
        }
      }
    };

    setupAuthListeners();
  }, []);

  return (
    <div className="h-screen w-screen bg-background text-foreground">
      <TabLayout />
    </div>
  );
}

export default App;
