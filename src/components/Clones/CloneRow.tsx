import type { CloneResponse } from '@/generated/types';

import { ImplantIcon } from './ImplantIcon';

interface CloneRowProps {
  clone: CloneResponse;
  implantNames: Map<number, string>;
}

export function CloneRow({ clone, implantNames }: CloneRowProps) {
  const displayName =
    clone.name ||
    (clone.clone_id ? `Clone ${clone.clone_id}` : 'Current Clone');
  const bgColor = clone.is_current ? 'bg-muted/50' : 'bg-background';

  return (
    <div
      className={`border rounded-lg p-3 ${bgColor} ${
        clone.is_current ? 'border-primary' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded bg-muted flex items-center justify-center">
          <svg
            className="w-6 h-6 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground">{displayName}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {clone.location_name || 'Unknown Location'}
          </div>
          {clone.implants.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {clone.implants.map((implant) => (
                <ImplantIcon
                  key={implant.implant_type_id}
                  implantId={implant.implant_type_id}
                  name={
                    implantNames.get(implant.implant_type_id) ||
                    `Implant ${implant.implant_type_id}`
                  }
                />
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground mt-2">
              No Implants Installed
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
