import { createFileRoute } from '@tanstack/react-router';

import { OverviewTable } from '@/components/OverviewTable';
import { ScrollArea } from '@/components/ui/scroll-area';

function OverviewPage() {
  return (
    <ScrollArea className="h-full">
      <div className="container mx-auto p-4 space-y-6">
        <OverviewTable />
      </div>
    </ScrollArea>
  );
}

export const Route = createFileRoute('/overview')({
  component: OverviewPage,
});
