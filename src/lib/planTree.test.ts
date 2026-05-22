import { describe, expect, it } from 'vitest';

import type { PlanGroup, SkillPlanResponse } from '@/generated/types';

import { assemblePlanTree, type PlanTreeNode } from './planTree';

function group(
  id: number,
  name: string,
  parent: number | null,
  sort: number
): PlanGroup {
  return {
    group_id: id,
    name,
    parent_group_id: parent ?? undefined,
    sort_order: sort,
  };
}

function plan(
  id: number,
  name: string,
  groupId: number | null,
  sort: number
): SkillPlanResponse {
  return {
    plan_id: id,
    name,
    description: undefined,
    auto_prerequisites: true,
    created_at: 0,
    updated_at: 0,
    group_id: groupId ?? undefined,
    sort_order: sort,
  };
}

describe('assemblePlanTree', () => {
  it('returns an empty tree for empty inputs', () => {
    expect(assemblePlanTree([], [])).toEqual([]);
  });

  it('nests groups with mixed parents into the correct shape', () => {
    const groups = [
      group(1, 'Doctrine', null, 0),
      group(2, 'Subcap', 1, 0),
      group(3, 'Shield', 2, 0),
      group(4, 'Misc', null, 1),
    ];
    const tree = assemblePlanTree(groups, []);
    expect(tree.map((n) => n.id)).toEqual([1, 4]);
    const doctrine = tree[0] as Extract<PlanTreeNode, { kind: 'group' }>;
    expect(doctrine.children.map((n) => n.id)).toEqual([2]);
    const subcap = doctrine.children[0] as Extract<
      PlanTreeNode,
      { kind: 'group' }
    >;
    expect(subcap.children.map((n) => n.id)).toEqual([3]);
  });

  it('places plans with null group_id at the root alongside top-level folders', () => {
    const groups = [group(1, 'Doctrine', null, 0)];
    const plans = [plan(10, 'Loose Plan', null, 1)];
    const tree = assemblePlanTree(groups, plans);
    expect(tree).toHaveLength(2);
    expect(tree[0].kind).toBe('group');
    expect(tree[1].kind).toBe('plan');
  });

  it('orders children within each parent by sort_order', () => {
    const groups = [group(1, 'Folder', null, 0)];
    const plans = [
      plan(10, 'Third', 1, 2),
      plan(11, 'First', 1, 0),
      plan(12, 'Second', 1, 1),
    ];
    const tree = assemblePlanTree(groups, plans);
    const folder = tree[0] as Extract<PlanTreeNode, { kind: 'group' }>;
    expect(folder.children.map((n) => n.name)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  it('mixes folders and plans as siblings within the same parent', () => {
    const groups = [group(1, 'Root', null, 0), group(2, 'Inner', 1, 1)];
    const plans = [plan(10, 'P0', 1, 0), plan(11, 'P2', 1, 2)];
    const tree = assemblePlanTree(groups, plans);
    const root = tree[0] as Extract<PlanTreeNode, { kind: 'group' }>;
    expect(
      root.children.map((n) => ({ kind: n.kind, sort: n.sort_order }))
    ).toEqual([
      { kind: 'plan', sort: 0 },
      { kind: 'group', sort: 1 },
      { kind: 'plan', sort: 2 },
    ]);
  });
});
