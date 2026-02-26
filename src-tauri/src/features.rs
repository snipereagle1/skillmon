use crate::esi::EsiScope;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum FeatureId {
    Contracts,
    Locations,
}

impl FeatureId {
    pub fn as_str(&self) -> &'static str {
        match self {
            FeatureId::Contracts => "contracts",
            FeatureId::Locations => "locations",
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
            id: FeatureId::Locations,
            name: "Locations".to_string(),
            description: "View your character's current solar system, ship, and online status.".to_string(),
            scopes: vec![
                EsiScope::ReadLocationV1,
                EsiScope::ReadOnlineV1,
                EsiScope::ReadShipTypeV1,
            ],
        },
    ]
}
