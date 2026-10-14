import { createFileRoute } from '@tanstack/react-router';

import { TrainingHistory } from '@/components/TrainingHistory/TrainingHistory';
import { ScrollArea } from '@/components/ui/scroll-area';

function HistoryPage() {
  return (
    <ScrollArea className="h-full">
      <div className="container mx-auto p-4">
        <TrainingHistory />
      </div>
    </ScrollArea>
  );
}

export const Route = createFileRoute('/history')({
  component: HistoryPage,
});
