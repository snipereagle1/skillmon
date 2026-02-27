use crate::db;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PlanNode {
    pub skill_type_id: i64,
    pub level: i64,
}

pub struct PlanDag {
    pub nodes: HashSet<PlanNode>,
    /// Maps a node to its direct dependencies (prerequisites)
    pub dependencies: HashMap<PlanNode, HashSet<PlanNode>>,
    /// Maps a node to those that depend on it
    pub dependents: HashMap<PlanNode, HashSet<PlanNode>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ValidationEntry {
    Cycle(Vec<PlanNode>),
    MissingPrerequisite {
        node: PlanNode,
        missing: PlanNode,
    },
    OrderingViolation {
        node: PlanNode,
        prerequisite: PlanNode,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<ValidationEntry>,
    pub warnings: Vec<ValidationEntry>,
}

impl PlanDag {
    pub fn new() -> Self {
        Self {
            nodes: HashSet::new(),
            dependencies: HashMap::new(),
            dependents: HashMap::new(),
        }
    }

    pub async fn add_node(&mut self, pool: &db::Pool, node: PlanNode) -> anyhow::Result<()> {
        if self.nodes.contains(&node) {
            return Ok(());
        }

        self.nodes.insert(node);

        // Add implicit dependency on previous level
        if node.level > 1 {
            let prev_level_node = PlanNode {
                skill_type_id: node.skill_type_id,
                level: node.level - 1,
            };
            self.add_edge(prev_level_node, node);
        }

        // Add SDE prerequisites
        let reqs: Vec<(i64, i64)> = sqlx::query_as::<_, (i64, i64)>(
            "SELECT required_skill_id, required_level
             FROM sde_skill_requirements
             WHERE skill_type_id = ?",
        )
        .bind(node.skill_type_id)
        .fetch_all(pool)
        .await?;

        for (req_id, req_level) in reqs {
            let prereq_node = PlanNode {
                skill_type_id: req_id,
                level: req_level,
            };
            self.add_edge(prereq_node, node);
        }

        Ok(())
    }

    fn add_edge(&mut self, from: PlanNode, to: PlanNode) {
        self.dependencies.entry(to).or_default().insert(from);
        self.dependents.entry(from).or_default().insert(to);
    }

    pub fn topological_sort(&self, preferred_order: &[PlanNode]) -> Vec<PlanNode> {
        let mut result = Vec::new();
        let mut in_degree: HashMap<PlanNode, usize> = HashMap::new();

        for node in &self.nodes {
            let mut degree = 0;
            if let Some(deps) = self.dependencies.get(node) {
                for prereq in deps {
                    if self.nodes.contains(prereq) {
                        degree += 1;
                    }
                }
            }
            in_degree.insert(*node, degree);
        }

        // We use a queue for nodes with in-degree 0.
        // To respect preferred order, we can't just use a simple queue if we want to stay close to it.
        // But for a stable sort that follows preferred order where valid:
        let mut available: HashSet<PlanNode> = in_degree
            .iter()
            .filter(|(_, &deg)| deg == 0)
            .map(|(&node, _)| node)
            .collect();

        let mut preferred_idx = 0;

        while !available.is_empty() {
            // Try to pick the next node from preferred order if it's available
            let mut picked = None;
            while preferred_idx < preferred_order.len() {
                let next_pref = preferred_order[preferred_idx];
                if available.contains(&next_pref) {
                    picked = Some(next_pref);
                    preferred_idx += 1;
                    break;
                }
                // If the next preferred node is already in result, skip it
                if result.contains(&next_pref) {
                    preferred_idx += 1;
                    continue;
                }
                // Otherwise, we can't pick it yet because its prerequisites aren't met
                break;
            }

            // If we couldn't pick from preferred order, pick anything from available (e.g., smallest skill_id)
            let node = picked.unwrap_or_else(|| {
                let node = *available.iter().next().unwrap();
                node
            });

            available.remove(&node);
            result.push(node);

            if let Some(deps) = self.dependents.get(&node) {
                for &dep in deps {
                    if let Some(degree) = in_degree.get_mut(&dep) {
                        *degree -= 1;
                        if *degree == 0 {
                            available.insert(dep);
                        }
                    }
                }
            }
        }

        result
    }

    pub fn validate(&self, current_order: &[PlanNode]) -> ValidationResult {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        let order_map: HashMap<PlanNode, usize> = current_order
            .iter()
            .enumerate()
            .map(|(i, &n)| (n, i))
            .collect();

        // Check for missing prerequisites and ordering violations
        for (idx, &node) in current_order.iter().enumerate() {
            if let Some(deps) = self.dependencies.get(&node) {
                for &prereq in deps {
                    if !order_map.contains_key(&prereq) {
                        warnings.push(ValidationEntry::MissingPrerequisite {
                            node,
                            missing: prereq,
                        });
                    } else if let Some(&prereq_idx) = order_map.get(&prereq) {
                        if prereq_idx > idx {
                            errors.push(ValidationEntry::OrderingViolation {
                                node,
                                prerequisite: prereq,
                            });
                        }
                    }
                }
            }
        }

        // Check for cycles
        let sorted = self.topological_sort(current_order);
        if sorted.len() < self.nodes.len() {
            errors.push(ValidationEntry::Cycle(Vec::new()));
        }

        ValidationResult {
            is_valid: errors.is_empty(),
            errors,
            warnings,
        }
    }

    pub async fn build_from_plan(
        pool: &db::Pool,
        plan_id: i64,
    ) -> anyhow::Result<(Self, Vec<PlanNode>)> {
        let entries = db::skill_plans::get_plan_nodes_in_order(pool, plan_id).await?;
        let mut dag = Self::new();
        let mut nodes = Vec::new();
        for (skill_type_id, planned_level) in entries {
            let node = PlanNode {
                skill_type_id,
                level: planned_level,
            };
            dag.add_node(pool, node).await?;
            nodes.push(node);
        }
        Ok((dag, nodes))
    }

    pub async fn add_recursive(&mut self, pool: &db::Pool, node: PlanNode) -> anyhow::Result<()> {
        if self.nodes.contains(&node) {
            return Ok(());
        }

        self.add_node(pool, node).await?;

        // After adding the node, we might have added new dependencies.
        // We need to recursively add those to the nodes set if we want them in the plan.
        if let Some(deps) = self.dependencies.get(&node).cloned() {
            for prereq in deps {
                Box::pin(self.add_recursive(pool, prereq)).await?;
            }
        }

        Ok(())
    }

    pub async fn add_node_from_set(
        &mut self,
        pool: &db::Pool,
        node: PlanNode,
        node_set: &HashSet<PlanNode>,
    ) -> anyhow::Result<()> {
        if !node_set.contains(&node) {
            return Ok(());
        }
        if self.nodes.contains(&node) {
            return Ok(());
        }

        self.nodes.insert(node);

        if node.level > 1 {
            let prev = PlanNode {
                skill_type_id: node.skill_type_id,
                level: node.level - 1,
            };
            if node_set.contains(&prev) {
                self.add_edge(prev, node);
            }
        }

        let reqs: Vec<(i64, i64)> = sqlx::query_as::<_, (i64, i64)>(
            "SELECT required_skill_id, required_level
             FROM sde_skill_requirements
             WHERE skill_type_id = ?",
        )
        .bind(node.skill_type_id)
        .fetch_all(pool)
        .await?;

        for (req_id, req_level) in reqs {
            let prereq_node = PlanNode {
                skill_type_id: req_id,
                level: req_level,
            };
            if node_set.contains(&prereq_node) {
                self.add_edge(prereq_node, node);
            }
        }

        Ok(())
    }
}
