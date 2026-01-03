import { Link } from '@tanstack/react-router';

import { Tabs, TabsList, TabsTrigger } from './tabs';

export interface NavigationTabItem {
  to: string;
  params?: Record<string, string>;
  label: string;
}

export interface NavigationTabsProps {
  items: NavigationTabItem[];
}

export function NavigationTabs({ items }: NavigationTabsProps) {
  return (
    <Tabs value={undefined} className="flex flex-col flex-1 overflow-hidden">
      <TabsList>
        {items.map((item) => {
          return (
            <Link
              key={item.to}
              to={item.to}
              params={item.params}
            >
              {({ isActive }: { isActive: boolean }) => (
                <TabsTrigger
                  value={item.to}
                  data-state={isActive ? 'active' : 'inactive'}
                >
                  {item.label}
                </TabsTrigger>
              )}
            </Link>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

