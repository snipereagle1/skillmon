import { cn } from '@/lib/utils';

interface AlphaIconProps {
  className?: string;
}

/**
 * A stylized "a" icon representing the EVE Alpha clone state.
 */
export function AlphaIcon({ className }: AlphaIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('inline-block', className)}
      aria-label="Alpha Clone"
    >
      <g transform="matrix(1.085049,0,0,1.085049,-1.020593,-1.237603)">
        <path d="M12,2L21,7.2L21,17.2L12,22.4L3,17.2L3,7.2L12,2Z" />
      </g>
      <g transform="matrix(1.442301,0,0,1.442301,-5.307616,-6.749917)">
        <path d="M15,10L15,16M15,13C15,11.354 13.646,10 12,10C10.354,10 9,11.354 9,13C9,14.646 10.354,16 12,16C13.646,16 15,14.646 15,13" />
      </g>
    </svg>
  );
}
