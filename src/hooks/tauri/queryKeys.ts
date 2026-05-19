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
  planComparisonByPlanAll: () => ['planComparison'] as const,
  planComparisonAll: (planId: number | null) =>
    ['planComparisonAll', planId] as const,
  planComparisonAllRoot: () => ['planComparisonAll'] as const,
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

  notificationSettings: (characterId: number | null) =>
    ['notificationSettings', characterId] as const,

  skillDetails: (skillId: number | null, characterId: number | null) =>
    ['skillDetails', skillId, characterId] as const,

  remaps: {
    plan: (planId: number | null) => ['remaps', 'plan', planId] as const,
    character: (characterId: number | null) =>
      ['remaps', 'character', characterId] as const,
  },

  simulation: (planId: number) => ['simulation', planId] as const,

  sdeSkills: () => ['sdeSkills'] as const,

  appSettings: () => ['app-settings'] as const,
  baseScopeStrings: () => ['base-scope-strings'] as const,
  enabledFeatures: () => ['enabled-features'] as const,
  optionalFeatures: () => ['optional-features'] as const,
  characterFeatureScopeStatus: () =>
    ['character-feature-scope-status'] as const,
};
