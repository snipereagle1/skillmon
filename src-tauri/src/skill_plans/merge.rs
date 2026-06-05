use std::collections::HashSet;

use super::graph::PlanNode;
use super::SkillmonPlanEntry;

/// Merge several source plans' entry lists into one deduplicated list.
///
/// Sources are processed in the given order. Within each source, entries are
/// walked in their stored order and appended to the result if their
/// `(skill_type_id, level)` node has not been seen yet; a node already present
/// from an earlier entry is skipped. First occurrence wins: the earliest
/// entry's `entry_type` and `notes` are kept and any later duplicate is dropped
/// (no tag upgrade).
///
/// No topological re-sort is performed. Sources are assumed to be valid,
/// prerequisite-ordered sequences, so this append-and-dedup preserves
/// prerequisite validity: a skipped node is skipped *because* it is already
/// present, so nothing a later entry depends on is ever dropped.
///
/// The returned entries are in final order. Assign a dense, sequential
/// `sort_order` from each entry's index when persisting.
pub fn merge_plan_entries(sources: &[Vec<SkillmonPlanEntry>]) -> Vec<SkillmonPlanEntry> {
    let mut seen: HashSet<PlanNode> = HashSet::new();
    let mut merged: Vec<SkillmonPlanEntry> = Vec::new();

    for source in sources {
        for entry in source {
            let node = PlanNode {
                skill_type_id: entry.skill_type_id,
                level: entry.level,
            };
            if seen.insert(node) {
                merged.push(entry.clone());
            }
        }
    }

    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    const PLANNED: &str = "Planned";
    const PREREQUISITE: &str = "Prerequisite";

    fn entry(
        skill_type_id: i64,
        level: i64,
        entry_type: &str,
        notes: Option<&str>,
    ) -> SkillmonPlanEntry {
        SkillmonPlanEntry {
            skill_type_id,
            level,
            entry_type: entry_type.to_string(),
            notes: notes.map(str::to_string),
        }
    }

    /// (skill, level) pairs in final order — a compact way to assert ordering.
    fn nodes(entries: &[SkillmonPlanEntry]) -> Vec<(i64, i64)> {
        entries.iter().map(|e| (e.skill_type_id, e.level)).collect()
    }

    #[test]
    fn preserves_source_order_and_appends_in_chosen_order() {
        let a = vec![entry(1, 1, PLANNED, None), entry(1, 2, PLANNED, None)];
        let b = vec![entry(2, 1, PLANNED, None)];

        let merged = merge_plan_entries(&[a, b]);

        assert_eq!(nodes(&merged), vec![(1, 1), (1, 2), (2, 1)]);
    }

    #[test]
    fn skips_nodes_already_present_from_an_earlier_source() {
        let a = vec![entry(10, 3, PLANNED, None)];
        let b = vec![entry(10, 3, PLANNED, None), entry(20, 1, PLANNED, None)];

        let merged = merge_plan_entries(&[a, b]);

        // (10, 3) appears once; (20, 1) still contributed.
        assert_eq!(nodes(&merged), vec![(10, 3), (20, 1)]);
    }

    #[test]
    fn multi_level_union_keeps_each_level_once_in_order() {
        // A: Gunnery III, then B: Gunnery IV, V => III, IV, V once each.
        let a = vec![entry(3300, 3, PLANNED, None)];
        let b = vec![entry(3300, 4, PLANNED, None), entry(3300, 5, PLANNED, None)];

        let merged = merge_plan_entries(&[a, b]);

        assert_eq!(nodes(&merged), vec![(3300, 3), (3300, 4), (3300, 5)]);
    }

    #[test]
    fn first_occurrence_wins_entry_type_and_notes() {
        // Earlier: Prerequisite with no notes. Later: Planned with notes.
        // The earlier tagging/notes are kept; no upgrade to Planned.
        let a = vec![entry(42, 5, PREREQUISITE, None)];
        let b = vec![entry(42, 5, PLANNED, Some("goal skill"))];

        let merged = merge_plan_entries(&[a, b]);

        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].entry_type, PREREQUISITE);
        assert_eq!(merged[0].notes, None);
    }

    #[test]
    fn merged_sort_order_is_dense_and_sequential() {
        let a = vec![entry(1, 1, PLANNED, None), entry(1, 2, PLANNED, None)];
        let b = vec![entry(1, 2, PLANNED, None), entry(2, 1, PLANNED, None)];

        let merged = merge_plan_entries(&[a, b]);

        // Assigning sort_order from the index yields 0..n with no gaps.
        let sort_orders: Vec<usize> = merged.iter().enumerate().map(|(i, _)| i).collect();
        assert_eq!(sort_orders, vec![0, 1, 2]);
        assert_eq!(merged.len(), 3);
    }

    #[test]
    fn fully_subsumed_later_source_contributes_nothing() {
        let a = vec![
            entry(1, 1, PLANNED, None),
            entry(1, 2, PLANNED, None),
            entry(1, 3, PLANNED, None),
        ];
        // Every node in B is already present in A.
        let b = vec![entry(1, 2, PLANNED, None), entry(1, 1, PLANNED, None)];

        let merged = merge_plan_entries(&[a.clone(), b]);

        assert_eq!(merged, a);
    }
}
