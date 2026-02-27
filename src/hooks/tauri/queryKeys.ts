export const queryKeys = {
  accountsAndCharacters: () => ['accountsAndCharacters'] as const,

  skillPlans: () => ['skillPlans'] as const,
  planFromCharacterPreview: (
    characterId: number | null,
    includedGroupIds: number[]
  ) =>
    [
      'planFromCharacterPreview',
      characterId,
      [...includedGroupIds].sort((a, b) => a - b),
    ] as const,
  skillPlan: (planId: number | null) => ['skillPlan', planId] as const,
  skillPlanWithEntries: (planId: number | null) =>
    ['skillPlanWithEntries', planId] as const,
  skillPlanWithEntriesAll: () => ['skillPlanWithEntries'] as const,
  skillPlanValidation: (planId: number | null) =>
    ['skillPlanValidation', planId] as const,
  skillPlanValidationAll: () => ['skillPlanValidation'] as const,
  exportSkillPlanText: (planId: number | null) =>
    ['exportSkillPlanText', planId] as const,
  exportSkillPlanXml: (planId: number | null) =>
    ['exportSkillPlanXml', planId] as const,
  planComparison: (planId: number | null, characterId: number | null) =>
    ['planComparison', planId, characterId] as const,
  planComparisonByPlan: (planId: number) => ['planComparison', planId] as const,
  planComparisonAll: (planId: number | null) =>
    ['planComparisonAll', planId] as const,
  skillPlanSimulation: (planId: number) =>
    ['skillPlanSimulation', planId] as const,
  skillPlanSimulationQuery: (
    planId: number,
    profileKey: string,
    characterId?: number | null
  ) => ['skillPlanSimulation', planId, profileKey, characterId] as const,
  skillPlanOptimization: (planId: number) =>
    ['skillPlanOptimization', planId] as const,
  skillPlanOptimizationQuery: (
    planId: number,
    implantsKey: string,
    baselineRemapKey: string,
    acceleratorBonus: number,
    characterId?: number | null,
    mode?: string,
    maxRemaps?: number
  ) =>
    [
      'skillPlanOptimization',
      planId,
      implantsKey,
      baselineRemapKey,
      acceleratorBonus,
      characterId,
      mode,
      maxRemaps,
    ] as const,

  skillQueue: (characterId: number | null) =>
    ['skillQueue', characterId] as const,

  trainingCharactersOverview: () => ['trainingCharactersOverview'] as const,

  characterSkills: (characterId: number | null) =>
    ['characterSkills', characterId] as const,
  attributes: (characterId: number | null) =>
    ['attributes', characterId] as const,
  clones: (characterId: number | null) => ['clones', characterId] as const,

  notifications: (
    characterId?: number | null,
    status?: 'active' | 'dismissed'
  ) => ['notifications', characterId, status] as const,
  notificationSettings: (characterId: number | null) =>
    ['notificationSettings', characterId] as const,

  skillDetails: (skillId: number | null, characterId: number | null) =>
    ['skillDetails', skillId, characterId] as const,

  remaps: {
    character: (characterId: number | null) =>
      ['remaps', 'character', characterId] as const,
    plan: (planId: number | null) => ['remaps', 'plan', planId] as const,
  },

  simulation: (planId: number) => ['simulation', planId] as const,

  sdeSkills: () => ['sdeSkills'] as const,

  baseScopeStrings: () => ['base-scope-strings'] as const,
  enabledFeatures: () => ['enabled-features'] as const,
  optionalFeatures: () => ['optional-features'] as const,
  characterFeatureScopeStatus: () =>
    ['character-feature-scope-status'] as const,

  location: (characterId: number) => ['location', characterId] as const,
};
