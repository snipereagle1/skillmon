import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SkillQueueItem {
  skill_id: number;
  queue_position: number;
  finished_level: number;
  start_date: string | null;
  finish_date: string | null;
  training_start_sp: number | null;
  level_start_sp: number | null;
  level_end_sp: number | null;
}

interface Character {
  character_id: number;
  character_name: string;
}

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

  const firstItem = skillQueue[0];
  if (firstItem.queue_position === 0 && firstItem.finish_date !== null) {
    return "training";
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
        "cursor-pointer transition-all hover:shadow-md",
        isSelected && "bg-muted/50"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 p-4">
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

