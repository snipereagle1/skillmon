import { useAttributes } from "@/hooks/tauri/useAttributes";
import type { AttributeBreakdown } from "@/generated/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AttributesProps {
  characterId: number | null;
}

const ATTRIBUTE_NAMES = [
  { key: "perception", label: "Perception" },
  { key: "memory", label: "Memory" },
  { key: "willpower", label: "Willpower" },
  { key: "intelligence", label: "Intelligence" },
  { key: "charisma", label: "Charisma" },
] as const;

export function Attributes({ characterId }: AttributesProps) {
  const { data, isLoading, error } = useAttributes(characterId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading attributes...</p>
      </div>
    );
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">
          Error: {errorMessage}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No attributes data available</p>
      </div>
    );
  }

  const formatBonus = (value: number): string => {
    if (value === 0) return "—";
    return value > 0 ? `+${value}` : `${value}`;
  };

  return (
    <div className="p-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Attribute</TableHead>
            <TableHead>Base Value</TableHead>
            <TableHead>Implants</TableHead>
            <TableHead>Remaps</TableHead>
            <TableHead>Accelerator</TableHead>
            <TableHead>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ATTRIBUTE_NAMES.map(({ key, label }) => {
            const attr: AttributeBreakdown = data[key as keyof typeof data];
            return (
              <TableRow key={key}>
                <TableCell className="font-medium">{label}</TableCell>
                <TableCell>{attr.base}</TableCell>
                <TableCell>{formatBonus(attr.implants)}</TableCell>
                <TableCell>{formatBonus(attr.remap)}</TableCell>
                <TableCell>{formatBonus(attr.accelerator)}</TableCell>
                <TableCell className="font-semibold">{attr.total}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

