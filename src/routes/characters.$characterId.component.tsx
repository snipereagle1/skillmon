import { getRouteApi, Navigate } from '@tanstack/react-router';

const routeApi = getRouteApi('/characters/$characterId');

export function CharactersCharacterId() {
  const { characterId } = routeApi.useParams();
  return (
    <Navigate
      to="/characters/$characterId/$tab"
      params={{ characterId, tab: 'skill-queue' }}
      replace
    />
  );
}
