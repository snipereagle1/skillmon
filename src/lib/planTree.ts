import type { PlanGroup, SkillPlanResponse } from '@/generated/types';

export type PlanTreeNode =
  | {
      kind: 'group';
      id: number;
      name: string;
      sort_order: number;
      children: PlanTreeNode[];
    }
  | {
      kind: 'plan';
      id: number;
      name: string;
      description?: string;
      sort_order: number;
    };

function compareNodes(a: PlanTreeNode, b: PlanTreeNode): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.id - b.id;
}

export function assemblePlanTree(
  groups: PlanGroup[],
  plans: SkillPlanResponse[]
): PlanTreeNode[] {
  const groupNodes = new Map<
    number,
    Extract<PlanTreeNode, { kind: 'group' }>
  >();
  for (const g of groups) {
    groupNodes.set(g.group_id, {
      kind: 'group',
      id: g.group_id,
      name: g.name,
      sort_order: g.sort_order,
      children: [],
    });
  }

  const roots: PlanTreeNode[] = [];

  for (const g of groups) {
    const node = groupNodes.get(g.group_id)!;
    const parentId = g.parent_group_id;
    if (parentId != null && groupNodes.has(parentId)) {
      groupNodes.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const p of plans) {
    const planNode: PlanTreeNode = {
      kind: 'plan',
      id: p.plan_id,
      name: p.name,
      description: p.description,
      sort_order: p.sort_order,
    };
    const parentId = p.group_id;
    if (parentId != null && groupNodes.has(parentId)) {
      groupNodes.get(parentId)!.children.push(planNode);
    } else {
      roots.push(planNode);
    }
  }

  const sortRecursive = (nodes: PlanTreeNode[]) => {
    nodes.sort(compareNodes);
    for (const n of nodes) {
      if (n.kind === 'group') sortRecursive(n.children);
    }
  };
  sortRecursive(roots);

  return roots;
}
