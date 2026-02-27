use std::collections::hash_map::Entry;
use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::db;
use crate::skill_plans::graph::{PlanDag, PlanNode};
use crate::utils;
use anyhow::Result;

async fn get_skill_group_id_cached(
    pool: &db::Pool,
    type_id: i64,
    cache: &mut HashMap<i64, Option<i64>>,
) -> Result<Option<i64>> {
    match cache.entry(type_id) {
        Entry::Occupied(e) => Ok(*e.get()),
        Entry::Vacant(e) => {
            let r = db::sde::get_skill_group_id(pool, type_id).await?;
            Ok(*e.insert(r))
        }
    }
}

struct AddSkillContext<'a> {
    pool: &'a db::Pool,
    char_skills: &'a HashMap<i64, i64>,
    included_groups: &'a HashSet<i64>,
    nodes: &'a mut HashMap<PlanNode, bool>,
    group_id_cache: &'a mut HashMap<i64, Option<i64>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreviewPlanFromCharacterGroup {
    pub group_id: i64,
    pub group_name: String,
    pub skill_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlanFromCharacterResult {
    pub nodes: Vec<(PlanNode, bool)>,
    pub estimated_sp: i64,
    pub groups: Vec<PreviewPlanFromCharacterGroup>,
}

pub async fn build_plan_from_character(
    pool: &db::Pool,
    character_id: i64,
    included_group_ids: &[i64],
) -> Result<PlanFromCharacterResult> {
    let included: HashSet<i64> = included_group_ids.iter().copied().collect();
    let char_skills = db::get_character_skills(pool, character_id).await?;
    let char_skills_map: HashMap<i64, i64> = char_skills
        .into_iter()
        .map(|s| (s.skill_id, s.trained_skill_level))
        .collect();

    let mut group_id_cache: HashMap<i64, Option<i64>> = HashMap::new();
    let mut nodes: HashMap<PlanNode, bool> = HashMap::new();

    for (skill_id, trained_level) in &char_skills_map {
        if *trained_level == 0 {
            continue;
        }
        let group_id = get_skill_group_id_cached(pool, *skill_id, &mut group_id_cache)
            .await?
            .unwrap_or(0);
        if !included.contains(&group_id) {
            continue;
        }

        let mut ctx = AddSkillContext {
            pool,
            char_skills: &char_skills_map,
            included_groups: &included,
            nodes: &mut nodes,
            group_id_cache: &mut group_id_cache,
        };
        add_skill_with_level(&mut ctx, *skill_id, *trained_level, true).await?;
    }

    let node_set: HashSet<PlanNode> = nodes.keys().copied().collect();
    let mut dag = PlanDag::new();
    for node in nodes.keys() {
        dag.add_node_from_set(pool, *node, &node_set).await?;
    }

    let sorted = dag.topological_sort(&[]);
    let mut nodes_with_type: Vec<(PlanNode, bool)> = Vec::with_capacity(sorted.len());
    for node in sorted {
        let is_planned = *nodes.get(&node).unwrap_or(&false);
        nodes_with_type.push((node, is_planned));
    }

    let skill_ids: Vec<i64> = nodes_with_type
        .iter()
        .map(|(n, _)| n.skill_type_id)
        .collect();
    // Default to empty map when SDE attributes are missing so SP estimate still runs.
    let skill_attrs = utils::get_skill_attributes(pool, &skill_ids)
        .await
        .unwrap_or_default();

    let mut estimated_sp = 0i64;
    let mut group_skill_counts: HashMap<i64, usize> = HashMap::new();
    let mut group_names: HashMap<i64, String> = HashMap::new();

    for (node, _) in &nodes_with_type {
        let rank = skill_attrs
            .get(&node.skill_type_id)
            .and_then(|a| a.rank)
            .unwrap_or(1);
        estimated_sp += utils::calculate_sp_for_level(rank, node.level as i32);

        let group_id = get_skill_group_id_cached(pool, node.skill_type_id, &mut group_id_cache)
            .await?
            .unwrap_or(0);
        *group_skill_counts.entry(group_id).or_default() += 1;
        match group_names.entry(group_id) {
            Entry::Occupied(_) => {}
            Entry::Vacant(e) => {
                let name: String =
                    sqlx::query_scalar("SELECT name FROM sde_groups WHERE group_id = ?")
                        .bind(group_id)
                        .fetch_optional(pool)
                        .await?
                        .unwrap_or_else(|| format!("Group {}", group_id));
                e.insert(name);
            }
        }
    }

    let groups: Vec<PreviewPlanFromCharacterGroup> = group_skill_counts
        .into_iter()
        .map(|(group_id, skill_count)| PreviewPlanFromCharacterGroup {
            group_id,
            group_name: group_names
                .get(&group_id)
                .cloned()
                .unwrap_or_else(|| format!("Group {}", group_id)),
            skill_count,
        })
        .collect();

    Ok(PlanFromCharacterResult {
        nodes: nodes_with_type,
        estimated_sp,
        groups,
    })
}

async fn add_skill_with_level(
    ctx: &mut AddSkillContext<'_>,
    skill_id: i64,
    level: i64,
    is_planned: bool,
) -> Result<()> {
    for l in 1..=level {
        let node = PlanNode {
            skill_type_id: skill_id,
            level: l,
        };
        match ctx.nodes.entry(node) {
            Entry::Occupied(mut e) => {
                if is_planned {
                    e.insert(true);
                }
            }
            Entry::Vacant(e) => {
                e.insert(is_planned && l == level);
            }
        }
    }

    let reqs: Vec<(i64, i64)> = sqlx::query_as::<_, (i64, i64)>(
        "SELECT required_skill_id, required_level FROM sde_skill_requirements WHERE skill_type_id = ?",
    )
    .bind(skill_id)
    .fetch_all(ctx.pool)
    .await?;

    for (req_id, req_level) in reqs {
        let req_group = get_skill_group_id_cached(ctx.pool, req_id, ctx.group_id_cache)
            .await?
            .unwrap_or(0);
        let target_level = if ctx.included_groups.contains(&req_group) {
            let char_level = ctx.char_skills.get(&req_id).copied().unwrap_or(0);
            req_level.max(char_level)
        } else {
            req_level
        };

        Box::pin(add_skill_with_level(ctx, req_id, target_level, false)).await?;
    }

    Ok(())
}
