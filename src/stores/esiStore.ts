import { create } from 'zustand';

import type {
  AttributesPayload,
  CloneInfo,
  LocationPayload,
  OverviewRow,
  QueuePayload,
  SkillsPayload,
} from '@/generated/types';

type ResourceSlice<T> = {
  data: T | null;
  lastUpdatedAt: string | null;
  lastError: string | null;
};

type ResourceKey = 'queues' | 'skills' | 'locations' | 'attributes' | 'clones';

interface EsiStoreState {
  queues: Record<number, ResourceSlice<QueuePayload>>;
  skills: Record<number, ResourceSlice<SkillsPayload>>;
  locations: Record<number, ResourceSlice<LocationPayload>>;
  attributes: Record<number, ResourceSlice<AttributesPayload>>;
  clones: Record<number, ResourceSlice<CloneInfo[]>>;
  overview: Record<number, OverviewRow>;

  setQueue(characterId: number, data: QueuePayload): void;
  setSkills(characterId: number, data: SkillsPayload): void;
  setLocation(characterId: number, data: LocationPayload): void;
  setAttributes(characterId: number, data: AttributesPayload): void;
  setClones(characterId: number, data: CloneInfo[]): void;
  setOverviewRow(characterId: number, row: OverviewRow): void;
  setError(resource: ResourceKey, characterId: number, error: string): void;
  clearCharacter(characterId: number): void;
}

const now = () => new Date().toISOString();

const DEFAULT_RESOURCE_SLICE = {
  data: null,
  lastUpdatedAt: null,
  lastError: null,
} satisfies ResourceSlice<never>;

export const useEsiStore = create<EsiStoreState>((set) => ({
  queues: {},
  skills: {},
  locations: {},
  attributes: {},
  clones: {},
  overview: {},

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

  setOverviewRow: (characterId, row) =>
    set((s) => ({
      overview: { ...s.overview, [characterId]: row },
    })),

  setError: (resource, characterId, error) =>
    set((s) => ({
      [resource]: {
        ...s[resource],
        [characterId]: {
          ...(s[resource][characterId] ?? DEFAULT_RESOURCE_SLICE),
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
      const dropOverview = (
        record: Record<number, OverviewRow>
      ): Record<number, OverviewRow> => {
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
        overview: dropOverview(s.overview),
      };
    }),
}));
