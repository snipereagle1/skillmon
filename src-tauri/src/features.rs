use crate::esi::EsiScope;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum FeatureId {
    Contracts,
    Industry,
    Locations,
    Waypoints,
}

impl FeatureId {
    pub fn as_str(&self) -> &'static str {
        match self {
            FeatureId::Contracts => "contracts",
            FeatureId::Industry => "industry",
            FeatureId::Locations => "locations",
            FeatureId::Waypoints => "waypoints",
        }
    }
}

impl std::str::FromStr for FeatureId {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        serde_plain::from_str(s).map_err(|_| ())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionalFeature {
    pub id: FeatureId,
    pub name: String,
    pub description: String,
    pub scopes: Vec<EsiScope>,
}

pub fn get_optional_features() -> Vec<OptionalFeature> {
    vec![
        OptionalFeature {
            id: FeatureId::Contracts,
            name: "Contracts".to_string(),
            description: "View your character's contracts and their details.".to_string(),
            scopes: vec![EsiScope::ReadCharacterContractsV1],
        },
        OptionalFeature {
            id: FeatureId::Industry,
            name: "Industry".to_string(),
            description: "View your character's industry jobs (manufacturing, research, etc.)."
                .to_string(),
            scopes: vec![EsiScope::ReadCharacterIndustryJobsV1],
        },
        OptionalFeature {
            id: FeatureId::Locations,
            name: "Locations".to_string(),
            description: "View your character's current solar system, ship, and online status."
                .to_string(),
            scopes: vec![
                EsiScope::ReadLocationV1,
                EsiScope::ReadOnlineV1,
                EsiScope::ReadShipTypeV1,
            ],
        },
        OptionalFeature {
            id: FeatureId::Waypoints,
            name: "Waypoints".to_string(),
            description: "Set waypoints in the EVE client".to_string(),
            scopes: vec![EsiScope::WriteWaypointV1],
        },
    ]
}
