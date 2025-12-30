import { createRoute } from '@tanstack/react-router';

import { charactersRoute } from './characters';
import { CharactersCharacterId } from './characters.$characterId.component';

export const charactersCharacterIdRoute = createRoute({
  getParentRoute: () => charactersRoute,
  path: '/$characterId',
  params: {
    parse: (params) => ({
      characterId: Number(params.characterId),
    }),
    stringify: (params) => ({
      characterId: String(params.characterId),
    }),
  },
  component: CharactersCharacterId,
});
