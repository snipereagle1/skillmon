import { createFileRoute } from '@tanstack/react-router';

import { OverviewTable } from '@/components/OverviewTable';

function OverviewPage() {
  return (
    <div className="container mx-auto p-4 space-y-6">
      <OverviewTable />
    </div>
  );
}

export const Route = createFileRoute('/overview')({
  component: OverviewPage,
});
