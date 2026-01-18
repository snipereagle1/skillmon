use serde::Serialize;
use tauri::State;

use crate::db;
use crate::esi;
use crate::esi_helpers;

#[derive(Debug, Clone, Serialize)]
pub struct CharacterAttributesResponse {
    pub charisma: i64,
    pub intelligence: i64,
    pub memory: i64,
    pub perception: i64,
    pub willpower: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AttributeBreakdown {
    pub base: i64,
    pub implants: i64,
    pub remap: i64,
    pub accelerator: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterAttributesBreakdown {
    pub charisma: AttributeBreakdown,
    pub intelligence: AttributeBreakdown,
    pub memory: AttributeBreakdown,
    pub perception: AttributeBreakdown,
    pub willpower: AttributeBreakdown,
    pub bonus_remaps: Option<i64>,
    pub accrued_remap_cooldown_date: Option<String>,
    pub last_remap_date: Option<String>,
}

#[tauri::command]
pub async fn get_character_attributes_breakdown(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
    character_id: i64,
) -> Result<CharacterAttributesBreakdown, String> {
    const BASE_ATTRIBUTE: i64 = 17;

    const ATTRIBUTE_IDS: [(i64, &str); 5] = [
        (164, "charisma"),
        (165, "intelligence"),
        (166, "memory"),
        (167, "perception"),
        (168, "willpower"),
    ];

    let access_token = crate::auth::ensure_valid_access_token(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get valid token: {}", e))?;

    let client = esi_helpers::create_authenticated_client(&access_token)
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let (attributes, bonus_remaps, accrued_remap_cooldown_date, last_remap_date) =
        match esi_helpers::get_cached_character_attributes(
            &pool,
            &client,
            character_id,
            &rate_limits,
        )
        .await
        {
            Ok(Some(attrs)) => (
                CharacterAttributesResponse {
                    charisma: attrs.charisma,
                    intelligence: attrs.intelligence,
                    memory: attrs.memory,
                    perception: attrs.perception,
                    willpower: attrs.willpower,
                },
                attrs.bonus_remaps,
                attrs
                    .accrued_remap_cooldown_date
                    .as_ref()
                    .map(|d| d.to_rfc3339()),
                attrs.last_remap_date.as_ref().map(|d| d.to_rfc3339()),
            ),
            _ => {
                if let Ok(Some(cached_attrs)) =
                    db::get_character_attributes(&pool, character_id).await
                {
                    (
                        CharacterAttributesResponse {
                            charisma: cached_attrs.charisma,
                            intelligence: cached_attrs.intelligence,
                            memory: cached_attrs.memory,
                            perception: cached_attrs.perception,
                            willpower: cached_attrs.willpower,
                        },
                        cached_attrs.bonus_remaps,
                        cached_attrs.accrued_remap_cooldown_date,
                        cached_attrs.last_remap_date,
                    )
                } else {
                    return Err(
                        "Character attributes not found. Please refresh your character data."
                            .to_string(),
                    );
                }
            }
        };

    let current_implants =
        esi_helpers::get_cached_character_implants(&pool, &client, character_id, &rate_limits)
            .await
            .map_err(|e| format!("Failed to fetch implants: {}", e))?
            .unwrap_or_default();

    let implant_bonuses = if current_implants.is_empty() {
        std::collections::HashMap::new()
    } else {
        db::get_implant_attribute_bonuses(&pool, &current_implants)
            .await
            .map_err(|e| format!("Failed to get implant bonuses: {}", e))?
    };

    let attribute_totals = [
        attributes.charisma,
        attributes.intelligence,
        attributes.memory,
        attributes.perception,
        attributes.willpower,
    ];

    let mut implant_totals = [0i64; 5];
    let mut remainders = [0i64; 5];

    const IMPLANT_BONUS_ATTR_IDS: [i64; 5] = [175, 176, 177, 178, 179];

    for (idx, (_, _)) in ATTRIBUTE_IDS.iter().enumerate() {
        let implant_bonus_attr_id = IMPLANT_BONUS_ATTR_IDS[idx];
        let mut implant_bonus = 0i64;
        for implant_id in &current_implants {
            if let Some(implant_attrs) = implant_bonuses.get(implant_id) {
                if let Some(&bonus) = implant_attrs.get(&implant_bonus_attr_id) {
                    implant_bonus += bonus;
                }
            }
        }
        implant_totals[idx] = implant_bonus;
        remainders[idx] = attribute_totals[idx] - BASE_ATTRIBUTE - implant_bonus;
    }

    // Solve for accelerator and remaps with constraints:
    // - remainder[i] = remap[i] + accelerator for all i
    // - sum(remaps) = 14 (exactly)
    // - remap[i] in [0, 10] for all i
    // - accelerator >= 0
    // Prefer remaps over accelerator (minimize accelerator, maximize remaps)

    const MAX_REMAP_PER_ATTR: i64 = 10;
    const MAX_REMAP_TOTAL: i64 = 14;

    // Find valid range for accelerator
    // Minimum: ensure no remap exceeds 10
    let min_accelerator = remainders
        .iter()
        .map(|&r| (r - MAX_REMAP_PER_ATTR).max(0))
        .max()
        .unwrap_or(0);

    // Maximum: ensure all remaps are >= 0
    let max_accelerator = *remainders.iter().min().unwrap_or(&0);

    // Try accelerator values from minimum to maximum (prefer lower accelerator = more remaps)
    // Find the one that gives sum(remaps) = 14 exactly
    let mut accelerator = min_accelerator;
    let mut remaps = [0i64; 5];

    for test_accelerator in min_accelerator..=max_accelerator {
        let mut test_remaps = [0i64; 5];
        let mut remap_sum = 0i64;

        for (idx, &remainder) in remainders.iter().enumerate() {
            let remap = (remainder - test_accelerator).clamp(0, MAX_REMAP_PER_ATTR);
            test_remaps[idx] = remap;
            remap_sum += remap;
        }

        // Check if this gives us exactly 14
        if remap_sum == MAX_REMAP_TOTAL {
            accelerator = test_accelerator;
            remaps = test_remaps;
            break;
        }
    }

    Ok(CharacterAttributesBreakdown {
        charisma: AttributeBreakdown {
            base: BASE_ATTRIBUTE,
            implants: implant_totals[0],
            remap: remaps[0],
            accelerator,
            total: attribute_totals[0],
        },
        intelligence: AttributeBreakdown {
            base: BASE_ATTRIBUTE,
            implants: implant_totals[1],
            remap: remaps[1],
            accelerator,
            total: attribute_totals[1],
        },
        memory: AttributeBreakdown {
            base: BASE_ATTRIBUTE,
            implants: implant_totals[2],
            remap: remaps[2],
            accelerator,
            total: attribute_totals[2],
        },
        perception: AttributeBreakdown {
            base: BASE_ATTRIBUTE,
            implants: implant_totals[3],
            remap: remaps[3],
            accelerator,
            total: attribute_totals[3],
        },
        willpower: AttributeBreakdown {
            base: BASE_ATTRIBUTE,
            implants: implant_totals[4],
            remap: remaps[4],
            accelerator,
            total: attribute_totals[4],
        },
        bonus_remaps,
        accrued_remap_cooldown_date,
        last_remap_date,
    })
}
