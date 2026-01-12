import { Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { Attributes, SimulationProfile } from '@/generated/types';

interface SimulationPanelProps {
  profile: SimulationProfile;
  onProfileChange: (profile: SimulationProfile) => void;
}

export function SimulationPanel({
  profile,
  onProfileChange,
}: SimulationPanelProps) {
  const handleImplantChange = (attr: keyof Attributes, delta: number) => {
    const currentValue = profile.implants[attr];
    const newValue = Math.max(0, Math.min(5, currentValue + delta));

    onProfileChange({
      ...profile,
      implants: {
        ...profile.implants,
        [attr]: newValue,
      },
    });
  };

  const attributes: (keyof Attributes)[] = [
    'intelligence',
    'memory',
    'perception',
    'willpower',
    'charisma',
  ];

  const initialRemap = profile.remaps.find((r) => r.entry_index === 0)
    ?.attributes || {
    charisma: 0,
    intelligence: 0,
    memory: 0,
    perception: 0,
    willpower: 0,
  };

  const totalRemapPoints = Object.values(initialRemap).reduce(
    (sum, val) => sum + (val as number),
    0
  );

  const handleRemapChange = (attr: keyof Attributes, delta: number) => {
    const currentValue = initialRemap[attr];
    const newValue = Math.max(0, Math.min(10, currentValue + delta));

    if (delta > 0 && totalRemapPoints >= 14) return;
    if (newValue === currentValue) return;

    const newAttributes = {
      ...initialRemap,
      [attr]: newValue,
    };

    const otherRemaps = profile.remaps.filter((r) => r.entry_index !== 0);

    onProfileChange({
      ...profile,
      remaps: [{ entry_index: 0, attributes: newAttributes }, ...otherRemaps],
    });
  };

  const currentAcceleratorBonus =
    profile.accelerators.find((a) => a.entry_index === 0)?.bonus || 0;

  const handleAcceleratorChange = (delta: number) => {
    const newValue = Math.max(0, Math.min(12, currentAcceleratorBonus + delta));

    if (newValue === currentAcceleratorBonus) return;

    if (newValue === 0) {
      onProfileChange({
        ...profile,
        accelerators: profile.accelerators.filter((a) => a.entry_index !== 0),
      });
    } else {
      onProfileChange({
        ...profile,
        accelerators: [
          {
            entry_index: 0,
            bonus: newValue,
            duration_seconds: 315360000, // 10 years
          },
          ...profile.accelerators.filter((a) => a.entry_index !== 0),
        ],
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Implant Bonuses</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {attributes.map((attr) => (
            <div key={attr} className="flex items-center justify-between">
              <Label className="capitalize">{attr}</Label>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleImplantChange(attr, -1)}
                  disabled={profile.implants[attr] <= 0}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="w-8 text-center font-mono">
                  {profile.implants[attr]}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleImplantChange(attr, 1)}
                  disabled={profile.implants[attr] >= 5}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Remap</CardTitle>
          <div className="text-xs text-muted-foreground font-mono">
            {totalRemapPoints} / 14 points
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {attributes.map((attr) => (
            <div key={attr} className="flex items-center justify-between">
              <Label className="capitalize">{attr}</Label>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleRemapChange(attr, -1)}
                  disabled={initialRemap[attr] <= 0}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="w-10 text-center font-mono">
                  +{initialRemap[attr]}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleRemapChange(attr, 1)}
                  disabled={initialRemap[attr] >= 10 || totalRemapPoints >= 14}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Cerebral Accelerator
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between">
            <Label>Attribute Bonus</Label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleAcceleratorChange(-1)}
                disabled={currentAcceleratorBonus <= 0}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="w-10 text-center font-mono">
                +{currentAcceleratorBonus}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleAcceleratorChange(1)}
                disabled={currentAcceleratorBonus >= 12}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
