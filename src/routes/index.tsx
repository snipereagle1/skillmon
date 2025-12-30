import { createRoute } from '@tanstack/react-router';

import { Overview } from '@/components/Overview';

import { rootRoute } from './__root';

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Overview,
});
