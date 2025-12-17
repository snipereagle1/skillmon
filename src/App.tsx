import { TabLayout } from './components/TabLayout';
import { useAuthEvents } from './hooks/tauri/useAuthEvents';
import { useStartupState } from './hooks/tauri/useStartupState';

function App() {
  useAuthEvents();
  const { isStartingUp } = useStartupState();

  if (isStartingUp) {
    return (
      <div className="h-screen w-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Starting up...</p>
          <p className="text-sm text-muted-foreground mt-2">
            Checking for updates and refreshing character data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-background text-foreground">
      <TabLayout />
    </div>
  );
}

export default App;
