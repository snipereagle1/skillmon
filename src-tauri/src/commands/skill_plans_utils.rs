use std::collections::{HashMap, HashSet, VecDeque};

use crate::db;

pub struct DependencyGraphResult {
    pub all_entries: HashMap<(i64, i64), String>,
    pub dependency_graph: HashMap<i64, Vec<i64>>,
    pub all_skill_ids: HashSet<i64>,
    pub planned_entry_order: Vec<(i64, i64)>,
}

pub async fn build_dependency_graph_for_entries(
    pool: &db::Pool,
    planned_entries: Vec<(i64, i64)>,
) -> Result<DependencyGraphResult, String> {
    let mut all_entries: HashMap<(i64, i64), String> = HashMap::new();
    let mut planned_entry_order: Vec<(i64, i64)> = Vec::new();

    for (skill_id, level) in &planned_entries {
        all_entries.insert((*skill_id, *level), "Planned".to_string());
        planned_entry_order.push((*skill_id, *level));

        for lower_level in 1..*level {
            let entry_key = (*skill_id, lower_level);
            all_entries
                .entry(entry_key)
                .or_insert_with(|| "Prerequisite".to_string());
        }
    }

    let mut dependency_graph: HashMap<i64, Vec<i64>> = HashMap::new();
    let mut all_skill_ids: HashSet<i64> = HashSet::new();

    for (skill_id, _) in &planned_entries {
        all_skill_ids.insert(*skill_id);
    }

    for (skill_id, _) in &planned_entries {
        let prerequisites = db::skill_plans::get_prerequisites_recursive(pool, *skill_id)
            .await
            .map_err(|e| format!("Failed to get prerequisites: {}", e))?;

        for prereq in prerequisites {
            for level in 1..=prereq.required_level {
                let entry_key = (prereq.required_skill_id, level);
                all_entries
                    .entry(entry_key)
                    .or_insert_with(|| "Prerequisite".to_string());
            }

            all_skill_ids.insert(prereq.required_skill_id);

            dependency_graph
                .entry(prereq.required_skill_id)
                .or_default()
                .push(*skill_id);
        }
    }

    let mut skills_to_process: VecDeque<i64> = all_skill_ids.iter().copied().collect();
    let mut processed_skills: HashSet<i64> = HashSet::new();

    while let Some(skill_id) = skills_to_process.pop_front() {
        if processed_skills.contains(&skill_id) {
            continue;
        }
        processed_skills.insert(skill_id);

        let direct_prereqs: Vec<(i64, i64)> = sqlx::query_as::<_, (i64, i64)>(
            "SELECT required_skill_id, required_level
             FROM sde_skill_requirements
             WHERE skill_type_id = ?",
        )
        .bind(skill_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to get direct prerequisites: {}", e))?;

        for (prereq_id, required_level) in direct_prereqs {
            for level in 1..=required_level {
                let entry_key = (prereq_id, level);
                all_entries
                    .entry(entry_key)
                    .or_insert_with(|| "Prerequisite".to_string());
            }

            all_skill_ids.insert(prereq_id);
            if !processed_skills.contains(&prereq_id) {
                skills_to_process.push_back(prereq_id);
            }

            dependency_graph
                .entry(prereq_id)
                .or_default()
                .push(skill_id);
        }
    }

    Ok(DependencyGraphResult {
        all_entries,
        dependency_graph,
        all_skill_ids,
        planned_entry_order,
    })
}

pub fn topological_sort_skills(
    dependency_graph: &HashMap<i64, Vec<i64>>,
    all_skill_ids: &HashSet<i64>,
    planned_entries: &[(i64, i64)],
) -> Vec<i64> {
    let mut in_degree: HashMap<i64, usize> = HashMap::new();
    for skill_id in all_skill_ids {
        in_degree.insert(*skill_id, 0);
    }
    for dependents in dependency_graph.values() {
        for dependent_id in dependents {
            *in_degree.entry(*dependent_id).or_insert(0) += 1;
        }
    }

    let mut queue: VecDeque<i64> = VecDeque::new();
    let mut sorted_skill_ids: Vec<i64> = Vec::new();

    let planned_skill_ids: HashSet<i64> = planned_entries.iter().map(|(sid, _)| *sid).collect();

    let mut zero_degree_prereqs: Vec<i64> = Vec::new();
    let mut zero_degree_planned: Vec<i64> = Vec::new();

    for (skill_id, &degree) in &in_degree {
        if degree == 0 {
            if planned_skill_ids.contains(skill_id) {
                zero_degree_planned.push(*skill_id);
            } else {
                zero_degree_prereqs.push(*skill_id);
            }
        }
    }

    zero_degree_planned.sort_by_key(|sid| {
        planned_entries
            .iter()
            .position(|(sid2, _)| sid2 == sid)
            .unwrap_or(usize::MAX)
    });

    queue.extend(zero_degree_prereqs);
    queue.extend(zero_degree_planned);

    while let Some(skill_id) = queue.pop_front() {
        sorted_skill_ids.push(skill_id);

        if let Some(dependents) = dependency_graph.get(&skill_id) {
            for &dependent_id in dependents {
                let degree = in_degree.get_mut(&dependent_id).unwrap();
                *degree -= 1;
                if *degree == 0 {
                    queue.push_back(dependent_id);
                }
            }
        }
    }

    sorted_skill_ids
}

pub fn build_sorted_entry_list(
    sorted_skill_ids: &[i64],
    all_entries: &HashMap<(i64, i64), String>,
    planned_entry_order: &[(i64, i64)],
) -> Vec<((i64, i64), String)> {
    let mut sorted_entries: Vec<((i64, i64), String)> = Vec::new();
    let mut processed_skills: HashSet<i64> = HashSet::new();

    for &skill_id in sorted_skill_ids {
        if processed_skills.contains(&skill_id) {
            continue;
        }
        processed_skills.insert(skill_id);

        let mut skill_entries: Vec<((i64, i64), String)> = all_entries
            .iter()
            .filter(|((sid, _), _)| *sid == skill_id)
            .map(|(k, v)| (*k, v.clone()))
            .collect();
        skill_entries.sort_by_key(|((_, level), _)| *level);

        sorted_entries.extend(skill_entries);
    }

    for (skill_id, level) in planned_entry_order {
        let entry_key = (*skill_id, *level);
        if !sorted_entries.iter().any(|(k, _)| *k == entry_key) {
            if let Some(entry_type) = all_entries.get(&entry_key) {
                sorted_entries.push((entry_key, entry_type.clone()));
            }
        }
    }

    sorted_entries
}

pub async fn insert_entries_with_sort_order(
    pool: &db::Pool,
    plan_id: i64,
    sorted_entries: &[((i64, i64), String)],
    start_sort_order: i64,
) -> Result<(), String> {
    let mut sort_order = start_sort_order;

    for ((skill_id, level), entry_type) in sorted_entries {
        let existing_entry: Option<(String, i64)> = sqlx::query_as::<_, (String, i64)>(
            "SELECT entry_type, sort_order FROM skill_plan_entries
             WHERE plan_id = ? AND skill_type_id = ? AND planned_level = ?",
        )
        .bind(plan_id)
        .bind(skill_id)
        .bind(level)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to check existing entry: {}", e))?;

        if existing_entry.is_some() {
            continue;
        }

        let higher_level_exists = sqlx::query_scalar::<_, Option<i64>>(
            "SELECT planned_level FROM skill_plan_entries
             WHERE plan_id = ? AND skill_type_id = ? AND planned_level > ?",
        )
        .bind(plan_id)
        .bind(skill_id)
        .bind(level)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to check higher level entry: {}", e))?;

        if higher_level_exists.is_some() {
            continue;
        }

        sqlx::query(
            "INSERT INTO skill_plan_entries (plan_id, skill_type_id, planned_level, sort_order, entry_type, notes)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, skill_type_id, planned_level) DO UPDATE SET
             entry_type = CASE
                 WHEN excluded.entry_type = 'Planned' THEN excluded.entry_type
                 WHEN skill_plan_entries.entry_type = 'Planned' THEN skill_plan_entries.entry_type
                 ELSE excluded.entry_type
             END,
             notes = excluded.notes",
        )
        .bind(plan_id)
        .bind(skill_id)
        .bind(level)
        .bind(sort_order)
        .bind(entry_type)
        .bind(None::<String>)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to add entry: {}", e))?;

        sort_order += 1;
    }

    Ok(())
}
