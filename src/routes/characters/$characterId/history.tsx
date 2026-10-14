import { createFileRoute } from '@tanstack/react-router';

import { TrainingHistory } from '@/components/TrainingHistory/TrainingHistory';
import { ScrollArea } from '@/components/ui/scroll-area';

function HistoryPage() {
  const { characterId } = Route.useParams();
  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <TrainingHistory characterId={Number(characterId)} />
      </div>
    </ScrollArea>
  );
}

export const Route = createFileRoute('/characters/$characterId/history')({
  component: HistoryPage,
});
