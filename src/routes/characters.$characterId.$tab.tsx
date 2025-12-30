import { createRoute } from '@tanstack/react-router';

import { CharacterDetail } from '@/components/CharacterDetail';

import { charactersCharacterIdRoute } from './characters.$characterId';

export const charactersCharacterIdTabRoute = createRoute({
  getParentRoute: () => charactersCharacterIdRoute,
  path: '/$tab',
  params: {
    parse: (params) => ({
      tab: params.tab,
    }),
    stringify: (params) => ({
      tab: params.tab,
    }),
  },
  validateSearch: () => {
    return {} as Record<string, never>;
  },
  component: CharacterDetail,
});
