import { createRootRoute } from '@tanstack/react-router';

import { RootLayout } from '@/components/RootLayout';

export const rootRoute = createRootRoute({
  component: RootLayout,
});
