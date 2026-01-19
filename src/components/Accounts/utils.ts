export type CharacterRoute =
  | '/characters/$characterId'
  | '/characters/$characterId/skills'
  | '/characters/$characterId/skill-queue'
  | '/characters/$characterId/settings'
  | '/characters/$characterId/plans'
  | '/characters/$characterId/clones'
  | '/characters/$characterId/attributes';

/**
 * Finds the most specific character sub-route from the current router matches.
 * Returns the routeId if it starts with /characters/$characterId/ and is not the base route.
 * Defaults to '/characters/$characterId'.
 */
export function getTargetCharacterRoute(
  matches: { routeId: string }[]
): CharacterRoute {
  const subRoute = matches
    .map((m) => m.routeId)
    .reverse()
    .find(
      (id) =>
        id.startsWith('/characters/$characterId/') &&
        id !== '/characters/$characterId/'
    );

  return (subRoute || '/characters/$characterId') as CharacterRoute;
}
