import { createHashHistory, createRouter } from '@tanstack/react-router';

import { rootRoute } from './routes/__root';
import { aboutRoute } from './routes/about';
import { charactersRoute } from './routes/characters';
import { charactersCharacterIdRoute } from './routes/characters.$characterId';
import { charactersCharacterIdTabRoute } from './routes/characters.$characterId.$tab';
import { indexRoute } from './routes/index';
import { plansRoute } from './routes/plans';

const routeTree = rootRoute.addChildren([
  indexRoute,
  charactersRoute.addChildren([
    charactersCharacterIdRoute.addChildren([charactersCharacterIdTabRoute]),
  ]),
  plansRoute,
  aboutRoute,
]);

const hashHistory = createHashHistory();

export const router = createRouter({
  routeTree,
  history: hashHistory,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
