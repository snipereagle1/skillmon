import { createRoute } from '@tanstack/react-router';

import { AboutTab } from '@/components/AboutTab';

import { rootRoute } from './__root';

export const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: AboutTab,
});
