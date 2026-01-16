use crate::db;
use crate::skill_plans::{Attributes, PlannedRemap};
use crate::utils;
use std::collections::HashMap;

const TOTAL_REMAP_POINTS: i64 = 14;
const MAX_POINTS_PER_ATTR: i64 = 10;

#[derive(Debug, Clone, serde::Serialize)]
pub struct OptimizationResult {
    pub recommended_remap: PlannedRemap,
    pub original_seconds: i64,
    pub optimized_seconds: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct OptimizedEntry {
    pub entry_id: i64,
    pub skill_type_id: i64,
    pub planned_level: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReorderOptimizationResult {
    pub optimized_entries: Vec<OptimizedEntry>,
    pub recommended_remaps: Vec<PlannedRemap>,
    pub original_seconds: i64,
    pub optimized_seconds: i64,
}

pub async fn optimize_plan_reordering(
    pool: &db::Pool,
    plan_id: i64,
    implants: &Attributes,
    baseline_remap: &Attributes,
    accelerator_bonus: i64,
    current_sp_map: &HashMap<i64, i64>,
    max_remaps: i64,
) -> anyhow::Result<ReorderOptimizationResult> {
    // 1. Get current entries and attributes
    let entries = db::skill_plans::get_plan_entries(pool, plan_id).await?;
    if entries.is_empty() {
        return Err(anyhow::anyhow!("Plan is empty"));
    }

    let skill_type_ids: Vec<i64> = entries.iter().map(|e| e.skill_type_id).collect();
    let skill_attributes = utils::get_skill_attributes(pool, &skill_type_ids)
        .await
        .map_err(|e| anyhow::anyhow!(e))?;

    // 2. Build DAG
    let (dag, _) = crate::skill_plans::graph::PlanDag::build_from_plan(pool, plan_id).await?;

    // Pre-calculate global optimal attributes for the entire plan to use as a sorting heuristic
    let global_opt = optimize_plan_attributes_internal(
        pool,
        &entries,
        implants,
        baseline_remap,
        accelerator_bonus,
        current_sp_map,
        &skill_attributes,
    ).await?;
    let ideal_attr = global_opt.recommended_remap.attributes;

    // Pre-calculate cumulative SP weight for each node (node SP + dependent nodes SP)
    let mut node_weights: HashMap<crate::skill_plans::graph::PlanNode, i64> = HashMap::new();
    fn calculate_weight(
        node: crate::skill_plans::graph::PlanNode,
        dag: &crate::skill_plans::graph::PlanDag,
        skill_attributes: &HashMap<i64, crate::utils::SkillAttributes>,
        current_sp_map: &HashMap<i64, i64>,
        memo: &mut HashMap<crate::skill_plans::graph::PlanNode, i64>,
    ) -> i64 {
        if let Some(&w) = memo.get(&node) {
            return w;
        }
        let attr = skill_attributes.get(&node.skill_type_id).unwrap();
        let rank = attr.rank.unwrap_or(1);
        let total_sp = utils::calculate_sp_for_level(rank, node.level as i32);
        let current_sp = *current_sp_map.get(&node.skill_type_id).unwrap_or(&0);
        let weight = (total_sp - current_sp).max(0);
        let mut total_weight = weight;
        if let Some(deps) = dag.dependents.get(&node) {
            for &dep in deps {
                total_weight += calculate_weight(dep, dag, skill_attributes, current_sp_map, memo);
            }
        }
        memo.insert(node, total_weight);
        total_weight
    }
    let mut memo = HashMap::new();
    for node in &dag.nodes {
        calculate_weight(*node, &dag, &skill_attributes, current_sp_map, &mut memo);
    }
    node_weights = memo;

    // 3. Greedy topological sort by attribute clusters
    let mut optimized_entries = Vec::new();
    let mut in_degree: HashMap<crate::skill_plans::graph::PlanNode, usize> = HashMap::new();
    for node in &dag.nodes {
        in_degree.insert(
            *node,
            dag.dependencies.get(node).map_or(0, |deps| deps.len()),
        );
    }

    let mut available: std::collections::HashSet<crate::skill_plans::graph::PlanNode> = in_degree
        .iter()
        .filter(|(_, &deg)| deg == 0)
        .map(|(&node, _)| node)
        .collect();

    let mut current_cluster: Option<(Option<i64>, Option<i64>)> = None;
    let mut current_sim_sp_map = current_sp_map.clone();

    while !available.is_empty() {
        // 1. Try to pick from current cluster
        let picked_node = if let Some(cluster) = current_cluster {
            available
                .iter()
                .filter(|n| {
                    let attr = skill_attributes.get(&n.skill_type_id).unwrap();
                    (attr.primary_attribute, attr.secondary_attribute) == cluster
                })
                .max_by_key(|n| node_weights.get(n).unwrap_or(&0))
                .copied()
        } else {
            None
        };

        let node = picked_node.unwrap_or_else(|| {
            // 2. Pick a new cluster - prioritize those that are "Baseline-heavy" vs "Ideal-heavy"
            let available_clusters: std::collections::HashSet<(Option<i64>, Option<i64>)> = available
                .iter()
                .map(|n| {
                    let attr = skill_attributes.get(&n.skill_type_id).unwrap();
                    (attr.primary_attribute, attr.secondary_attribute)
                })
                .collect();

            let best_cluster = available_clusters
                .into_iter()
                .max_by(|&(p1, s1), &(p2, s2)| {
                    let p1_base = get_effective_attr_value(baseline_remap, implants, accelerator_bonus, p1);
                    let s1_base = get_effective_attr_value(baseline_remap, implants, accelerator_bonus, s1);
                    let speed1_base = utils::calculate_sp_per_minute(p1_base, s1_base);
                    let p1_ideal = get_effective_attr_value(&ideal_attr, implants, accelerator_bonus, p1);
                    let s1_ideal = get_effective_attr_value(&ideal_attr, implants, accelerator_bonus, s1);
                    let speed1_ideal = utils::calculate_sp_per_minute(p1_ideal, s1_ideal);

                    let p2_base = get_effective_attr_value(baseline_remap, implants, accelerator_bonus, p2);
                    let s2_base = get_effective_attr_value(baseline_remap, implants, accelerator_bonus, s2);
                    let speed2_base = utils::calculate_sp_per_minute(p2_base, s2_base);
                    let p2_ideal = get_effective_attr_value(&ideal_attr, implants, accelerator_bonus, p2);
                    let s2_ideal = get_effective_attr_value(&ideal_attr, implants, accelerator_bonus, s2);
                    let speed2_ideal = utils::calculate_sp_per_minute(p2_ideal, s2_ideal);

                    // Ratio of Baseline Speed to Ideal Speed. 
                    // High ratio means "train this now while we are on baseline".
                    // Low ratio means "wait until we remap to ideal".
                    let ratio1 = speed1_base / speed1_ideal;
                    let ratio2 = speed2_base / speed2_ideal;

                    ratio1.partial_cmp(&ratio2).unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|(c, _)| c);

            current_cluster = best_cluster;

            *available
                .iter()
                .filter(|n| {
                    let attr = skill_attributes.get(&n.skill_type_id).unwrap();
                    (attr.primary_attribute, attr.secondary_attribute) == best_cluster.unwrap()
                })
                .max_by_key(|n| node_weights.get(n).unwrap_or(&0))
                .unwrap()
        });

        // #region agent log
        {
            use std::io::Write;
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open("/home/mckernanin/projects/eve/skillmon/.cursor/debug.log")
            {
                let log = serde_json::json!({
                    "sessionId": "debug-session",
                    "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
                    "location": "optimization.rs:163",
                    "hypothesisId": "H12",
                    "message": "Greedy sort picked node with Ratio Scoring",
                    "data": {
                        "skill_id": node.skill_type_id,
                        "level": node.level,
                        "cluster": (skill_attributes.get(&node.skill_type_id).unwrap().primary_attribute, skill_attributes.get(&node.skill_type_id).unwrap().secondary_attribute)
                    }
                });
                let _ = writeln!(file, "{}", log.to_string());
            }
        }
        // #endregion

        available.remove(&node);

        // Update simulated SP
        let attr = skill_attributes.get(&node.skill_type_id).unwrap();
        let rank = attr.rank.unwrap_or(1);
        let total_sp = utils::calculate_sp_for_level(rank, node.level as i32);
        current_sim_sp_map.insert(node.skill_type_id, total_sp);

        // Find the original entry for this node
        let original_entry = entries
            .iter()
            .find(|e| e.skill_type_id == node.skill_type_id && e.planned_level == node.level)
            .unwrap();
        optimized_entries.push(OptimizedEntry {
            entry_id: original_entry.entry_id,
            skill_type_id: original_entry.skill_type_id,
            planned_level: original_entry.planned_level,
            notes: original_entry.notes.clone(),
        });

        if let Some(dependents) = dag.dependents.get(&node) {
            for &dep in dependents {
                if let Some(degree) = in_degree.get_mut(&dep) {
                    *degree -= 1;
                    if *degree == 0 {
                        available.insert(dep);
                    }
                }
            }
        }
    }

    // 4. Group by cluster and calculate optimal remaps
    let mut recommended_remaps = Vec::new();
    let total_optimized_seconds: f64;

    // Group optimized_entries into clusters
    let mut clusters = Vec::new();
    if !optimized_entries.is_empty() {
        let first_attr = skill_attributes
            .get(&optimized_entries[0].skill_type_id)
            .unwrap();
        let mut current_key = (first_attr.primary_attribute, first_attr.secondary_attribute);
        let mut current_group = Vec::new();
        let mut start_idx = 0;

        for (idx, entry) in optimized_entries.iter().enumerate() {
            let attr = skill_attributes.get(&entry.skill_type_id).unwrap();
            let key = (attr.primary_attribute, attr.secondary_attribute);

            if key != current_key {
                clusters.push((start_idx, current_group));
                current_group = Vec::new();
                current_key = key;
                start_idx = idx;
            }
            current_group.push(entry.clone());
        }
        clusters.push((start_idx, current_group));
    }

    // #region agent log
    {
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open("/home/mckernanin/projects/eve/skillmon/.cursor/debug.log")
        {
            let cluster_summaries: Vec<_> = clusters.iter().map(|(start, entries)| {
                let first_entry = &entries[0];
                let attr = skill_attributes.get(&first_entry.skill_type_id).unwrap();
                serde_json::json!({
                    "start_idx": start,
                    "count": entries.len(),
                    "attributes": (attr.primary_attribute, attr.secondary_attribute)
                })
            }).collect();
            let log = serde_json::json!({
                "sessionId": "debug-session",
                "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
                "location": "optimization.rs:198",
                "hypothesisId": "H1",
                "message": "Clusters grouped",
                "data": {
                    "num_clusters": clusters.len(),
                    "clusters": cluster_summaries
                }
            });
            let _ = writeln!(file, "{}", log.to_string());
        }
    }
    // #endregion

    let num_clusters = clusters.len();
    if num_clusters == 0 {
        total_optimized_seconds = 0.0;
    } else {
        // Convert clusters to SkillPlanEntry for calculations
        let cluster_entries: Vec<Vec<crate::db::skill_plans::SkillPlanEntry>> = clusters
            .iter()
            .map(|(_, entries)| {
                entries
                    .iter()
                    .map(|e| crate::db::skill_plans::SkillPlanEntry {
                        entry_id: e.entry_id,
                        plan_id,
                        skill_type_id: e.skill_type_id,
                        planned_level: e.planned_level,
                        sort_order: 0,
                        entry_type: String::new(),
                        notes: e.notes.clone(),
                    })
                    .collect()
            })
            .collect();

        // precalculate sp_map at cluster boundaries
        let mut cluster_sp_maps = Vec::with_capacity(num_clusters + 1);
        let mut cur_sp_map = current_sp_map.clone();
        cluster_sp_maps.push(cur_sp_map.clone());
        for entries in &cluster_entries {
            for entry in entries {
                let attr = skill_attributes.get(&entry.skill_type_id).unwrap();
                let rank = attr.rank.unwrap_or(1);
                let total_sp = utils::calculate_sp_for_level(rank, entry.planned_level as i32);

                let current_val = cur_sp_map.entry(entry.skill_type_id).or_insert(0);
                *current_val = (*current_val).max(total_sp);
            }
            cluster_sp_maps.push(cur_sp_map.clone());
        }

        // cost[i][j] = min time for clusters i..j with its optimal remap
        let mut opt_segment_results = HashMap::new();
        for (i, sp_map) in cluster_sp_maps.iter().enumerate().take(num_clusters) {
            for j in i + 1..=num_clusters {
                let mut flat_entries = Vec::new();
                for entries in cluster_entries.iter().take(j).skip(i) {
                    flat_entries.extend(entries.clone());
                }
                let opt = optimize_plan_attributes_internal(
                    pool,
                    &flat_entries,
                    implants,
                    baseline_remap,
                    accelerator_bonus,
                    sp_map,
                    &skill_attributes,
                )
                .await?;
                opt_segment_results.insert(
                    (i, j),
                    (
                        opt.optimized_seconds as f64,
                        opt.recommended_remap.attributes,
                    ),
                );
            }
        }

        let mut baseline_cluster_times = Vec::new();
        for i in 0..num_clusters {
            let mut time = 0.0;
            let mut demand_map = HashMap::new();
            for entry in &cluster_entries[i] {
                let attr = skill_attributes.get(&entry.skill_type_id).unwrap();
                let key = (attr.primary_attribute, attr.secondary_attribute);
                let rank = attr.rank.unwrap_or(1);
                let total_sp = utils::calculate_sp_for_level(rank, entry.planned_level as i32);
                let current_sp = *cluster_sp_maps[i].get(&entry.skill_type_id).unwrap_or(&0);
                let sp_remaining = (total_sp - current_sp).max(0);
                if sp_remaining > 0 {
                    *demand_map.entry(key).or_insert(0) += sp_remaining;
                }
            }
            for ((p, s), sp) in demand_map {
                let p_val =
                    get_effective_attr_value(baseline_remap, implants, accelerator_bonus, p);
                let s_val =
                    get_effective_attr_value(baseline_remap, implants, accelerator_bonus, s);
                let sp_per_min = utils::calculate_sp_per_minute(p_val, s_val);
                if sp_per_min > 0.0 {
                    time += (sp as f64 / sp_per_min) * 60.0;
                }
            }
            baseline_cluster_times.push(time);
        }

        // #region agent log
        {
            use std::io::Write;
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open("/home/mckernanin/projects/eve/skillmon/.cursor/debug.log")
            {
                let log = serde_json::json!({
                    "sessionId": "debug-session",
                    "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
                    "location": "optimization.rs:293",
                    "hypothesisId": "H3",
                    "message": "Baseline cluster times calculated",
                    "data": {
                        "baseline_cluster_times_days": baseline_cluster_times.iter().map(|t| t / 86400.0).collect::<Vec<_>>()
                    }
                });
                let _ = writeln!(file, "{}", log.to_string());
            }
        }
        // #endregion

        let m_limit = max_remaps.max(0) as usize;

        // dp_remap[m][i] = min time to train clusters i..num_clusters using up to m remaps.
        // Each remap is an optimal remap for a segment.
        let mut dp_remap =
            vec![vec![(f64::MAX, 0, Attributes::default()); num_clusters + 1]; m_limit + 1];

        // Base case: 0 remaps for i..num_clusters is only possible if i == num_clusters.
        for row in dp_remap.iter_mut().take(m_limit + 1) {
            row[num_clusters] = (0.0, num_clusters, Attributes::default());
        }

        // m=1: optimal time for i..num_clusters using one remap at i.
        for (i, item) in dp_remap[1].iter_mut().enumerate().take(num_clusters) {
            if let Some((t_seg, attr_seg)) = opt_segment_results.get(&(i, num_clusters)) {
                *item = (*t_seg, num_clusters, attr_seg.clone());
            }
        }

        for m in 2..=m_limit {
            for i in 0..num_clusters {
                // Option 1: Use fewer remaps
                let mut best = dp_remap[m - 1][i].clone();

                // Option 2: Remap at i for segment i..j, then use m-1 remaps for j..num_clusters
                for (j, (t_rest, _, _)) in dp_remap[m - 1]
                    .iter()
                    .enumerate()
                    .take(num_clusters)
                    .skip(i + 1)
                {
                    if let Some((t_seg, attr_seg)) = opt_segment_results.get(&(i, j)) {
                        if *t_rest != f64::MAX && t_seg + t_rest < best.0 {
                            best = (t_seg + t_rest, j, attr_seg.clone());
                        }
                    }
                }
                dp_remap[m][i] = best;
            }
        }

        // Now consider the baseline period at the beginning.
        // We can train 0..k clusters with baseline_remap, then use m_limit remaps for k..num_clusters.
        let mut best_total_time = baseline_cluster_times.iter().sum::<f64>();
        let mut best_k = num_clusters;

        for k in 0..num_clusters {
            let baseline_time: f64 = baseline_cluster_times[0..k].iter().sum();
            let (remap_time, _, _) = &dp_remap[m_limit][k];
            
            // #region agent log
            {
                use std::io::Write;
                if let Ok(mut file) = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open("/home/mckernanin/projects/eve/skillmon/.cursor/debug.log")
                {
                    let log = serde_json::json!({
                        "sessionId": "debug-session",
                        "timestamp": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
                        "location": "optimization.rs:343",
                        "hypothesisId": "H2",
                        "message": "DP evaluation at k",
                        "data": {
                            "k": k,
                            "baseline_time_days": baseline_time / 86400.0,
                            "remap_time_days": remap_time / 86400.0,
                            "total_time_days": (baseline_time + remap_time) / 86400.0,
                            "remap_attrs": if *remap_time == f64::MAX { None } else { Some(dp_remap[m_limit][k].2.clone()) }
                        }
                    });
                    let _ = writeln!(file, "{}", log.to_string());
                }
            }
            // #endregion

            if *remap_time != f64::MAX && baseline_time + remap_time < best_total_time {
                best_total_time = baseline_time + remap_time;
                best_k = k;
            }
        }

        total_optimized_seconds = best_total_time;

        // Reconstruct remaps
        let mut cur_remaps = Vec::new();
        if best_k < num_clusters {
            let mut cur_m = m_limit;
            let mut cur_i = best_k;
            let mut last_attr = baseline_remap.clone();

            while cur_i < num_clusters && cur_m > 0 {
                let (time, next_i, attr) = &dp_remap[cur_m][cur_i];
                let (prev_time, _, _) = &dp_remap[cur_m - 1][cur_i];

                if *time == *prev_time {
                    // We can achieve the same time with fewer remaps
                    cur_m -= 1;
                } else {
                    // We used a remap at cur_i
                    if attr != &last_attr {
                        cur_remaps.push(PlannedRemap {
                            entry_index: clusters[cur_i].0,
                            attributes: attr.clone(),
                        });
                        last_attr = attr.clone();
                    }
                    cur_i = *next_i;
                    cur_m -= 1;
                }
            }
        }
        recommended_remaps = cur_remaps;
    }

    // 5. Calculate original time (No Remap, Original Order)
    let original_opt = optimize_plan_attributes_internal(
        pool,
        &entries,
        implants,
        baseline_remap,
        accelerator_bonus,
        current_sp_map,
        &skill_attributes,
    )
    .await?;
    let original_seconds = original_opt.original_seconds;

    Ok(ReorderOptimizationResult {
        optimized_entries,
        recommended_remaps,
        original_seconds,
        optimized_seconds: total_optimized_seconds.ceil() as i64,
    })
}

pub async fn optimize_plan_attributes(
    pool: &db::Pool,
    entries: &[crate::db::skill_plans::SkillPlanEntry],
    implants: &Attributes,
    baseline_remap: &Attributes,
    accelerator_bonus: i64,
    current_sp_map: &HashMap<i64, i64>,
) -> anyhow::Result<OptimizationResult> {
    let skill_type_ids: Vec<i64> = entries.iter().map(|e| e.skill_type_id).collect();
    let skill_attributes = utils::get_skill_attributes(pool, &skill_type_ids)
        .await
        .map_err(|e| anyhow::anyhow!(e))?;

    optimize_plan_attributes_internal(
        pool,
        entries,
        implants,
        baseline_remap,
        accelerator_bonus,
        current_sp_map,
        &skill_attributes,
    )
    .await
}

async fn optimize_plan_attributes_internal(
    _pool: &db::Pool,
    entries: &[crate::db::skill_plans::SkillPlanEntry],
    implants: &Attributes,
    baseline_remap: &Attributes,
    accelerator_bonus: i64,
    current_sp_map: &HashMap<i64, i64>,
    skill_attributes: &HashMap<i64, crate::utils::SkillAttributes>,
) -> anyhow::Result<OptimizationResult> {
    // 1. Calculate SP demand per (primary, secondary) pair
    let mut demand_map: HashMap<(Option<i64>, Option<i64>), i64> = HashMap::new();
    let mut used_attributes = std::collections::HashSet::new();

    let mut simulated_sp = current_sp_map.clone(); // Correctly track SP deltas

    for entry in entries {
        let skill_attr = skill_attributes.get(&entry.skill_type_id).ok_or_else(|| {
            anyhow::anyhow!("Attributes not found for skill {}", entry.skill_type_id)
        })?;

        let rank = skill_attr.rank.unwrap_or(1);
        let total_sp_needed = utils::calculate_sp_for_level(rank, entry.planned_level as i32);
        let current_sp = *simulated_sp.get(&entry.skill_type_id).unwrap_or(&0);
        let sp_remaining = (total_sp_needed - current_sp).max(0);

        if sp_remaining > 0 {
            let key = (skill_attr.primary_attribute, skill_attr.secondary_attribute);
            *demand_map.entry(key).or_insert(0) += sp_remaining;
            simulated_sp.insert(entry.skill_type_id, total_sp_needed); // Use total_sp_needed for next entries of same skill

            if let Some(p) = skill_attr.primary_attribute {
                used_attributes.insert(p);
            }
            if let Some(s) = skill_attr.secondary_attribute {
                used_attributes.insert(s);
            }
        }
    }

    if demand_map.is_empty() {
        return Ok(OptimizationResult {
            recommended_remap: PlannedRemap {
                entry_index: 0,
                attributes: baseline_remap.clone(),
            },
            original_seconds: 0,
            optimized_seconds: 0,
        });
    }

    // 2. Generate all valid attribute distributions (pruned by used_attributes)
    let distributions = generate_distributions(&used_attributes);

    let mut best_attributes = Attributes::default();
    let mut min_seconds = f64::MAX;

    // 3. Find distribution that minimizes total time
    for dist in distributions {
        let mut total_seconds = 0.0;
        for ((primary_id, secondary_id), sp) in &demand_map {
            let p_val = get_effective_attr_value(&dist, implants, accelerator_bonus, *primary_id);
            let s_val = get_effective_attr_value(&dist, implants, accelerator_bonus, *secondary_id);
            let sp_per_min = utils::calculate_sp_per_minute(p_val, s_val);
            if sp_per_min > 0.0 {
                total_seconds += (*sp as f64 / sp_per_min) * 60.0;
            }
        }

        if total_seconds < min_seconds {
            min_seconds = total_seconds;
            best_attributes = dist;
        }
    }

    // 4. Calculate baseline for comparison (baseline remap + implants + accelerator)
    let mut original_seconds = 0.0;
    for ((primary_id, secondary_id), sp) in &demand_map {
        let p_val =
            get_effective_attr_value(baseline_remap, implants, accelerator_bonus, *primary_id);
        let s_val =
            get_effective_attr_value(baseline_remap, implants, accelerator_bonus, *secondary_id);
        let sp_per_min = utils::calculate_sp_per_minute(p_val, s_val);
        if sp_per_min > 0.0 {
            original_seconds += (*sp as f64 / sp_per_min) * 60.0;
        }
    }

    Ok(OptimizationResult {
        recommended_remap: PlannedRemap {
            entry_index: 0,
            attributes: best_attributes,
        },
        original_seconds: original_seconds.ceil() as i64,
        optimized_seconds: min_seconds.ceil() as i64,
    })
}

fn generate_distributions(used_ids: &std::collections::HashSet<i64>) -> Vec<Attributes> {
    let mut results = Vec::new();
    let mut current = [0i64; 5];

    // Attribute IDs in EVE:
    // Intelligence: 165
    // Memory: 166
    // Perception: 167
    // Willpower: 168
    // Charisma: 164
    let is_used = [
        used_ids.contains(&165),
        used_ids.contains(&166),
        used_ids.contains(&167),
        used_ids.contains(&168),
        used_ids.contains(&164),
    ];

    fn backtrack(
        idx: usize,
        remaining: i64,
        current: &mut [i64; 5],
        is_used: &[bool; 5],
        results: &mut Vec<Attributes>,
    ) {
        if idx == 5 {
            if remaining == 0 {
                results.push(Attributes {
                    intelligence: current[0],
                    memory: current[1],
                    perception: current[2],
                    willpower: current[3],
                    charisma: current[4],
                });
            }
            return;
        }

        // If this attribute is not used, it must be 0
        if !is_used[idx] {
            current[idx] = 0;
            backtrack(idx + 1, remaining, current, is_used, results);
            return;
        }

        let max_for_this = remaining.min(MAX_POINTS_PER_ATTR);
        for val in 0..=max_for_this {
            current[idx] = val;
            backtrack(idx + 1, remaining - val, current, is_used, results);
        }
    }

    backtrack(0, TOTAL_REMAP_POINTS, &mut current, &is_used, &mut results);
    results
}

fn get_effective_attr_value(
    remap: &Attributes,
    implants: &Attributes,
    accelerator_bonus: i64,
    attr_id: Option<i64>,
) -> i64 {
    const BASE: i64 = 17;
    match attr_id {
        Some(165) => BASE + remap.intelligence + implants.intelligence + accelerator_bonus,
        Some(166) => BASE + remap.memory + implants.memory + accelerator_bonus,
        Some(167) => BASE + remap.perception + implants.perception + accelerator_bonus,
        Some(168) => BASE + remap.willpower + implants.willpower + accelerator_bonus,
        Some(164) => BASE + remap.charisma + implants.charisma + accelerator_bonus,
        _ => BASE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdata::{fixtures, TestDb};
    use std::collections::HashMap;

    #[tokio::test]
    async fn test_optimize_plan_attributes_basic() {
        let db = TestDb::new_with_sde().await.unwrap();
        let plan_id = fixtures::create_skill_plan(&db.pool, "Test Plan").await;

        // Add some skills (Spaceship Command I, II)
        fixtures::add_plan_entry(&db.pool, plan_id, 3327, 1, "Planned").await;
        fixtures::add_plan_entry(&db.pool, plan_id, 3327, 2, "Planned").await;

        let entries = crate::db::skill_plans::get_plan_entries(&db.pool, plan_id)
            .await
            .unwrap();
        let implants = Attributes::default();
        let baseline = Attributes::default();
        let current_sp = HashMap::new();

        let result =
            optimize_plan_attributes(&db.pool, &entries, &implants, &baseline, 0, &current_sp)
                .await
                .unwrap();

        assert!(result.optimized_seconds <= result.original_seconds);
        // Spaceship Command is Per/Wil. Optimal remap should favor Per/Wil.
        assert!(
            result.recommended_remap.attributes.perception > 0
                || result.recommended_remap.attributes.willpower > 0
        );
        assert!(result.optimized_seconds > 0);
        assert!(result.original_seconds > 0);
    }

    #[tokio::test]
    async fn test_optimize_plan_reordering_with_remaps() {
        let db = TestDb::new_with_sde().await.unwrap();
        let plan_id = fixtures::create_skill_plan(&db.pool, "Test Reorder Remaps").await;

        // Add 3 independent skills with different attribute clusters
        // Navigation (Int/Per)
        fixtures::add_plan_entry(&db.pool, plan_id, 3449, 1, "Planned").await;
        // Science (Int/Mem)
        fixtures::add_plan_entry(&db.pool, plan_id, 3402, 1, "Planned").await;
        // Spaceship Command (Per/Wil)
        fixtures::add_plan_entry(&db.pool, plan_id, 3327, 1, "Planned").await;

        let implants = Attributes::default();
        let baseline = Attributes::default();
        let current_sp = HashMap::new();

        let result = optimize_plan_reordering(
            &db.pool,
            plan_id,
            &implants,
            &baseline,
            0,
            &current_sp,
            2, // max 2 remaps
        )
        .await
        .unwrap();

        assert_eq!(result.optimized_entries.len(), 3);
        assert!(result.optimized_seconds <= result.original_seconds);
    }

    #[tokio::test]
    async fn test_optimize_real_character_plan() {
        let db = TestDb::new_with_sde().await.unwrap();

        // 1. Load Skill Plan
        let plan_path = format!(
            "{}/src/testdata/test.skillmon.json",
            env!("CARGO_MANIFEST_DIR")
        );
        let plan_id = fixtures::load_plan_from_json(&db.pool, &plan_path).await;

        // 2. Load Attributes
        let attr_path = format!(
            "{}/src/testdata/character_2117051965_attributes.json",
            env!("CARGO_MANIFEST_DIR")
        );
        let attr_json = std::fs::read_to_string(attr_path).unwrap();
        let attr_raw: Attributes = serde_json::from_str(&attr_json).unwrap();

        // Normalize attributes: character has +4 implants, remap is the rest above 17+4
        let implants = Attributes {
            intelligence: 4,
            memory: 4,
            perception: 4,
            willpower: 4,
            charisma: 4,
        };
        let baseline = Attributes {
            intelligence: attr_raw.intelligence - 17 - implants.intelligence,
            memory: attr_raw.memory - 17 - implants.memory,
            perception: attr_raw.perception - 17 - implants.perception,
            willpower: attr_raw.willpower - 17 - implants.willpower,
            charisma: attr_raw.charisma - 17 - implants.charisma,
        };

        // 3. Load Skills (SP Map)
        let skills_path = format!(
            "{}/src/testdata/character_2117051965_skills.json",
            env!("CARGO_MANIFEST_DIR")
        );
        let skills_json = std::fs::read_to_string(skills_path).unwrap();
        #[derive(serde::Deserialize)]
        struct JsonSkill {
            skill_id: i64,
            skillpoints_in_skill: i64,
        }
        let skills: Vec<JsonSkill> = serde_json::from_str(&skills_json).unwrap();
        let mut current_sp = HashMap::new();
        for s in skills {
            current_sp.insert(s.skill_id, s.skillpoints_in_skill);
        }

        let result =
            optimize_plan_reordering(&db.pool, plan_id, &implants, &baseline, 0, &current_sp, 1)
                .await
                .unwrap();

        // Calculate total SP trained
        let entries = db::skill_plans::get_plan_entries(&db.pool, plan_id)
            .await
            .unwrap();
        let skill_type_ids: Vec<i64> = entries.iter().map(|e| e.skill_type_id).collect();
        let skill_attributes = utils::get_skill_attributes(&db.pool, &skill_type_ids)
            .await
            .unwrap();
        let skill_names = utils::get_skill_names(&db.pool, &skill_type_ids)
            .await
            .unwrap();

        println!("Plan: Blops + Repro");

        println!("\nOptimized Training Schedule:");
        println!(
            "{:<30} {:<5} {:<15} {:<12} {:<10} {:<15}",
            "Skill Name", "Lvl", "Training Time", "SP/Hour", "SP Needed", "Attributes"
        );
        println!("{}", "-".repeat(100));

        let mut total_sp_to_train = 0;
        let mut temp_sp_map = current_sp.clone();
        let mut current_remap = baseline.clone();

        for (idx, entry) in result.optimized_entries.iter().enumerate() {
            // Check if we need to apply a new remap
            if let Some(remap) = result
                .recommended_remaps
                .iter()
                .find(|r| r.entry_index == idx)
            {
                current_remap = remap.attributes.clone();
                println!(
                    "--- REMAP: Int:{}, Mem:{}, Per:{}, Wil:{}, Cha:{} ---",
                    current_remap.intelligence,
                    current_remap.memory,
                    current_remap.perception,
                    current_remap.willpower,
                    current_remap.charisma
                );
            }

            let attr = skill_attributes.get(&entry.skill_type_id).unwrap();
            let rank = attr.rank.unwrap_or(1);
            let name = skill_names
                .get(&entry.skill_type_id)
                .cloned()
                .unwrap_or_else(|| "Unknown Skill".to_string());

            let target_sp = utils::calculate_sp_for_level(rank, entry.planned_level as i32);
            let current = *temp_sp_map.get(&entry.skill_type_id).unwrap_or(&0);

            if target_sp > current {
                let needed = target_sp - current;
                total_sp_to_train += needed;

                let p_val =
                    get_effective_attr_value(&current_remap, &implants, 0, attr.primary_attribute);
                let s_val = get_effective_attr_value(
                    &current_remap,
                    &implants,
                    0,
                    attr.secondary_attribute,
                );
                let sp_per_min = utils::calculate_sp_per_minute(p_val, s_val);
                let sp_per_hour = sp_per_min * 60.0;
                let seconds = (needed as f64 / sp_per_min) * 60.0;

                let days = (seconds / 86400.0).floor();
                let hours = ((seconds % 86400.0) / 3600.0).floor();
                let mins = ((seconds % 3600.0) / 60.0).floor();

                let time_str = format!("{:>2.0}d {:>2.0}h {:>2.0}m", days, hours, mins);
                let attr_str = format!(
                    "{:?}/{:?}",
                    attr.primary_attribute, attr.secondary_attribute
                );

                println!(
                    "{:<30} {:<5} {:<15} {:>12.1} {:>10} {:<15}",
                    name, entry.planned_level, time_str, sp_per_hour, needed, attr_str
                );

                temp_sp_map.insert(entry.skill_type_id, target_sp);
            }
        }

        println!("\nTotal SP to Train: {}", total_sp_to_train);
        println!(
            "Original Time: {:.2} days",
            result.original_seconds as f64 / 86400.0
        );
        println!(
            "Optimized Time: {:.2} days",
            result.optimized_seconds as f64 / 86400.0
        );
        println!(
            "Savings: {:.2} days",
            (result.original_seconds - result.optimized_seconds) as f64 / 86400.0
        );
        println!("Remaps: {}", result.recommended_remaps.len());
        for (i, remap) in result.recommended_remaps.iter().enumerate() {
            println!(
                "  Remap {}: at entry {}, attributes: {:?}",
                i + 1,
                remap.entry_index,
                remap.attributes
            );
        }

        assert!(result.optimized_seconds <= result.original_seconds);
    }
}
