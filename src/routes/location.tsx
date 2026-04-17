import { createFileRoute } from '@tanstack/react-router';

import { LocationTable } from '@/components/LocationTable';
import { ScrollArea } from '@/components/ui/scroll-area';

function LocationPage() {
  return (
    <ScrollArea className="h-full">
      <div className="container mx-auto p-4">
        <LocationTable />
      </div>
    </ScrollArea>
  );
}

export const Route = createFileRoute('/location')({
  component: LocationPage,
});
