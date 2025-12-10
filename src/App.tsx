import { useAuthEvents } from "./hooks/tauri/useAuthEvents";
import { TabLayout } from "./components/TabLayout";

function App() {
  useAuthEvents();

  return (
    <div className="h-screen w-screen bg-background text-foreground">
      <TabLayout />
    </div>
  );
}

export default App;
