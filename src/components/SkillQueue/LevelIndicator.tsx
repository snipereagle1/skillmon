export function LevelIndicator({ level }: { level: number }) {
  const squares = Array.from({ length: level }, (_, i) => (
    <div key={i} className="w-2 h-2 bg-blue-400 dark:bg-blue-500 rounded-sm" />
  ));

  return <div className="flex gap-0.5 w-14">{squares}</div>;
}
