import { createFileRoute } from '@tanstack/react-router';

function OverviewPage() {
  return (
    <div className="flex items-center justify-center h-full p-4">
      <p className="text-muted-foreground">Overview content coming soon...</p>
    </div>
  );
}

export const Route = createFileRoute('/overview')({
  component: OverviewPage,
});
