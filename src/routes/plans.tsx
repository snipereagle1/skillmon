import { createRoute } from '@tanstack/react-router';

import { SkillPlans } from '@/components/SkillPlans';

import { rootRoute } from './__root';

export const plansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plans',
  component: SkillPlans,
});
