import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Character, SkillQueueItem } from "@/generated/types";
import { isAfter, isBefore, isEqual } from "date-fns";

interface CharacterCardProps {
  character: Character;
  skillQueue?: SkillQueueItem[];
  isSelected?: boolean;
  onClick?: () => void;
}

type TrainingStatus = "training" | "empty" | "paused";

function getTrainingStatus(skillQueue: SkillQueueItem[] | undefined): TrainingStatus {
  if (!skillQueue || skillQueue.length === 0) {
    return "empty";
  }

  const now = new Date();

  for (const item of skillQueue) {
    // Check if queue_position is 0 (currently training)
    if (item.queue_position === 0) {
      return "training";
    }

    // Check if current time is between start_date and finish_date
    // Backend logic: now >= start_utc && now < finish_utc (inclusive start, exclusive end)
    if (item.start_date !== null && item.finish_date !== null) {
      try {
        const startDate = new Date(item.start_date);
        const finishDate = new Date(item.finish_date);

        const isAfterOrEqualStart = isAfter(now, startDate) || isEqual(now, startDate);
        const isBeforeFinish = isBefore(now, finishDate);

        if (isAfterOrEqualStart && isBeforeFinish) {
          return "training";
        }
      } catch (e) {
        // Invalid date format, skip this check
      }
    }
  }

  return "paused";
}

function getBorderColor(status: TrainingStatus): string {
  switch (status) {
    case "training":
      return "border-green-500";
    case "empty":
      return "border-orange-500";
    case "paused":
      return "border-white";
    default:
      return "border-border";
  }
}

export function CharacterCard({
  character,
  skillQueue,
  isSelected = false,
  onClick,
}: CharacterCardProps) {
  const status = getTrainingStatus(skillQueue);
  const borderColor = getBorderColor(status);

  const portraitUrl = `https://images.evetech.net/characters/${character.character_id}/portrait?size=64`;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md py-4",
        isSelected && "bg-muted/50"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 px-4">
        <img
          src={portraitUrl}
          alt={character.character_name}
          className={cn("size-12 rounded border-2", borderColor)}
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{character.character_name}</p>
        </div>
      </div>
    </Card>
  );
}

