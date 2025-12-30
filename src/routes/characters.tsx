import { createRoute } from '@tanstack/react-router';

import { CharactersIndex } from '@/components/CharactersIndex';

import { rootRoute } from './__root';

export const charactersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/characters',
  component: CharactersIndex,
});
