import { create } from 'zustand';

import type {
  CharacterAttributesBreakdown,
  CharacterLocationOverview,
  CharacterSkillQueue,
  CharacterSkillsResponse,
  CloneResponse,
  Remap,
} from '@/generated/types';

type ResourceSlice<T> = {
  data: T | null;
  lastUpdatedAt: string | null;
  lastError: string | null;
};

type ResourceKey =
  | 'queues'
  | 'skills'
  | 'locations'
  | 'attributes'
  | 'clones'
  | 'remaps';

interface EsiStoreState {
  queues: Record<number, ResourceSlice<CharacterSkillQueue>>;
  skills: Record<number, ResourceSlice<CharacterSkillsResponse>>;
  locations: Record<number, ResourceSlice<CharacterLocationOverview>>;
  attributes: Record<number, ResourceSlice<CharacterAttributesBreakdown>>;
  clones: Record<number, ResourceSlice<CloneResponse[]>>;
  remaps: Record<number, ResourceSlice<Remap[]>>;

  setQueue(characterId: number, data: CharacterSkillQueue): void;
  setSkills(characterId: number, data: CharacterSkillsResponse): void;
  setLocation(characterId: number, data: CharacterLocationOverview): void;
  setAttributes(characterId: number, data: CharacterAttributesBreakdown): void;
  setClones(characterId: number, data: CloneResponse[]): void;
  setRemaps(characterId: number, data: Remap[]): void;
  setError(resource: ResourceKey, characterId: number, error: string): void;
  clearCharacter(characterId: number): void;
}

const now = () => new Date().toISOString();

export const useEsiStore = create<EsiStoreState>((set) => ({
  queues: {},
  skills: {},
  locations: {},
  attributes: {},
  clones: {},
  remaps: {},

  setQueue: (characterId, data) =>
    set((s) => ({
      queues: {
        ...s.queues,
        [characterId]: { data, lastUpdatedAt: now(), lastError: null },
      },
    })),

  setSkills: (characterId, data) =>
    set((s) => ({
      skills: {
        ...s.skills,
        [characterId]: { data, lastUpdatedAt: now(), lastError: null },
      },
    })),

  setLocation: (characterId, data) =>
    set((s) => ({
      locations: {
        ...s.locations,
        [characterId]: { data, lastUpdatedAt: now(), lastError: null },
      },
    })),

  setAttributes: (characterId, data) =>
    set((s) => ({
      attributes: {
        ...s.attributes,
        [characterId]: { data, lastUpdatedAt: now(), lastError: null },
      },
    })),

  setClones: (characterId, data) =>
    set((s) => ({
      clones: {
        ...s.clones,
        [characterId]: { data, lastUpdatedAt: now(), lastError: null },
      },
    })),

  setRemaps: (characterId, data) =>
    set((s) => ({
      remaps: {
        ...s.remaps,
        [characterId]: { data, lastUpdatedAt: now(), lastError: null },
      },
    })),

  setError: (resource, characterId, error) =>
    set((s) => ({
      [resource]: {
        ...s[resource],
        [characterId]: {
          ...(s[resource][characterId] ?? { data: null, lastUpdatedAt: null }),
          lastError: error,
        },
      },
    })),

  clearCharacter: (characterId) =>
    set((s) => {
      const drop = <T>(
        record: Record<number, ResourceSlice<T>>
      ): Record<number, ResourceSlice<T>> => {
        const next = { ...record };
        delete next[characterId];
        return next;
      };
      return {
        queues: drop(s.queues),
        skills: drop(s.skills),
        locations: drop(s.locations),
        attributes: drop(s.attributes),
        clones: drop(s.clones),
        remaps: drop(s.remaps),
      };
    }),
}));
