import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/hooks/tauri/useNotifications";

interface NotificationBellProps {
  onOpen: () => void;
}

export function NotificationBell({ onOpen }: NotificationBellProps) {
  const { data: activeNotifications = [] } = useNotifications(undefined, "active");
  const activeCount = activeNotifications.length;

  return (
    <Button variant="ghost" size="icon" onClick={onOpen} className="relative">
      <Bell className="h-5 w-5" />
      {activeCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
        >
          {activeCount > 9 ? "9+" : activeCount}
        </Badge>
      )}
    </Button>
  );
}


