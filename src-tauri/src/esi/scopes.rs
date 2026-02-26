use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum EsiScope {
    #[serde(rename = "publicData")]
    PublicData,

    #[serde(rename = "esi-calendar.respond_calendar_events.v1")]
    RespondCalendarEventsV1,
    #[serde(rename = "esi-calendar.read_calendar_events.v1")]
    ReadCalendarEventsV1,

    #[serde(rename = "esi-location.read_location.v1")]
    ReadLocationV1,
    #[serde(rename = "esi-location.read_ship_type.v1")]
    ReadShipTypeV1,
    #[serde(rename = "esi-location.read_online.v1")]
    ReadOnlineV1,

    #[serde(rename = "esi-mail.organize_mail.v1")]
    OrganizeMailV1,
    #[serde(rename = "esi-mail.read_mail.v1")]
    ReadMailV1,
    #[serde(rename = "esi-mail.send_mail.v1")]
    SendMailV1,

    #[serde(rename = "esi-skills.read_skills.v1")]
    ReadSkillsV1,
    #[serde(rename = "esi-skills.read_skillqueue.v1")]
    ReadSkillqueueV1,

    #[serde(rename = "esi-wallet.read_character_wallet.v1")]
    ReadCharacterWalletV1,
    #[serde(rename = "esi-wallet.read_corporation_wallet.v1")]
    ReadCorporationWalletV1,
    #[serde(rename = "esi-wallet.read_corporation_wallets.v1")]
    ReadCorporationWalletsV1,

    #[serde(rename = "esi-search.search_structures.v1")]
    SearchStructuresV1,

    #[serde(rename = "esi-clones.read_clones.v1")]
    ReadClonesV1,
    #[serde(rename = "esi-clones.read_implants.v1")]
    ReadImplantsV1,

    #[serde(rename = "esi-characters.read_contacts.v1")]
    ReadCharacterContactsV1,
    #[serde(rename = "esi-characters.write_contacts.v1")]
    WriteCharacterContactsV1,
    #[serde(rename = "esi-characters.read_loyalty.v1")]
    ReadCharacterLoyaltyV1,
    #[serde(rename = "esi-characters.read_chat_channels.v1")]
    ReadCharacterChatChannelsV1,
    #[serde(rename = "esi-characters.read_medals.v1")]
    ReadCharacterMedalsV1,
    #[serde(rename = "esi-characters.read_standings.v1")]
    ReadCharacterStandingsV1,
    #[serde(rename = "esi-characters.read_agents_research.v1")]
    ReadAgentsResearchV1,
    #[serde(rename = "esi-characters.read_blueprints.v1")]
    ReadCharacterBlueprintsV1,
    #[serde(rename = "esi-characters.read_corporation_roles.v1")]
    ReadCharacterCorporationRolesV1,
    #[serde(rename = "esi-characters.read_fatigue.v1")]
    ReadCharacterFatigueV1,
    #[serde(rename = "esi-characters.read_notifications.v1")]
    ReadCharacterNotificationsV1,
    #[serde(rename = "esi-characters.read_titles.v1")]
    ReadCharacterTitlesV1,
    #[serde(rename = "esi-characters.read_fw_stats.v1")]
    ReadCharacterFwStatsV1,
    #[serde(rename = "esi-characters.read_freelance_jobs.v1")]
    ReadCharacterFreelanceJobsV1,

    #[serde(rename = "esi-universe.read_structures.v1")]
    ReadStructuresV1,

    #[serde(rename = "esi-killmails.read_killmails.v1")]
    ReadKillmailsV1,
    #[serde(rename = "esi-killmails.read_corporation_killmails.v1")]
    ReadCorporationKillmailsV1,

    #[serde(rename = "esi-corporations.read_corporation_membership.v1")]
    ReadCorporationMembershipV1,
    #[serde(rename = "esi-corporations.read_structures.v1")]
    ReadCorporationStructuresV1,
    #[serde(rename = "esi-corporations.track_members.v1")]
    TrackCorporationMembersV1,
    #[serde(rename = "esi-corporations.read_divisions.v1")]
    ReadCorporationDivisionsV1,
    #[serde(rename = "esi-corporations.read_contacts.v1")]
    ReadCorporationContactsV1,
    #[serde(rename = "esi-corporations.read_titles.v1")]
    ReadCorporationTitlesV1,
    #[serde(rename = "esi-corporations.read_blueprints.v1")]
    ReadCorporationBlueprintsV1,
    #[serde(rename = "esi-corporations.read_standings.v1")]
    ReadCorporationStandingsV1,
    #[serde(rename = "esi-corporations.read_starbases.v1")]
    ReadCorporationStarbasesV1,
    #[serde(rename = "esi-corporations.read_container_logs.v1")]
    ReadCorporationContainerLogsV1,
    #[serde(rename = "esi-corporations.read_facilities.v1")]
    ReadCorporationFacilitiesV1,
    #[serde(rename = "esi-corporations.read_medals.v1")]
    ReadCorporationMedalsV1,
    #[serde(rename = "esi-corporations.read_fw_stats.v1")]
    ReadCorporationFwStatsV1,
    #[serde(rename = "esi-corporations.read_projects.v1")]
    ReadCorporationProjectsV1,
    #[serde(rename = "esi-corporations.read_freelance_jobs.v1")]
    ReadCorporationFreelanceJobsV1,

    #[serde(rename = "esi-assets.read_assets.v1")]
    ReadAssetsV1,
    #[serde(rename = "esi-assets.read_corporation_assets.v1")]
    ReadCorporationAssetsV1,

    #[serde(rename = "esi-planets.manage_planets.v1")]
    ManagePlanetsV1,
    #[serde(rename = "esi-planets.read_customs_offices.v1")]
    ReadCustomsOfficesV1,

    #[serde(rename = "esi-fleets.read_fleet.v1")]
    ReadFleetV1,
    #[serde(rename = "esi-fleets.write_fleet.v1")]
    WriteFleetV1,

    #[serde(rename = "esi-ui.open_window.v1")]
    OpenWindowV1,
    #[serde(rename = "esi-ui.write_waypoint.v1")]
    WriteWaypointV1,

    #[serde(rename = "esi-fittings.read_fittings.v1")]
    ReadFittingsV1,
    #[serde(rename = "esi-fittings.write_fittings.v1")]
    WriteFittingsV1,

    #[serde(rename = "esi-markets.structure_markets.v1")]
    StructureMarketsV1,
    #[serde(rename = "esi-markets.read_character_orders.v1")]
    ReadCharacterMarketOrdersV1,
    #[serde(rename = "esi-markets.read_corporation_orders.v1")]
    ReadCorporationMarketOrdersV1,

    #[serde(rename = "esi-industry.read_character_jobs.v1")]
    ReadCharacterIndustryJobsV1,
    #[serde(rename = "esi-industry.read_corporation_jobs.v1")]
    ReadCorporationIndustryJobsV1,
    #[serde(rename = "esi-industry.read_character_mining.v1")]
    ReadCharacterMiningV1,
    #[serde(rename = "esi-industry.read_corporation_mining.v1")]
    ReadCorporationMiningV1,

    #[serde(rename = "esi-contracts.read_character_contracts.v1")]
    ReadCharacterContractsV1,
    #[serde(rename = "esi-contracts.read_corporation_contracts.v1")]
    ReadCorporationContractsV1,

    #[serde(rename = "esi-alliances.read_contacts.v1")]
    ReadAllianceContactsV1,
}

impl EsiScope {
    pub fn as_str(&self) -> &'static str {
        match self {
            EsiScope::PublicData => "publicData",
            EsiScope::RespondCalendarEventsV1 => "esi-calendar.respond_calendar_events.v1",
            EsiScope::ReadCalendarEventsV1 => "esi-calendar.read_calendar_events.v1",
            EsiScope::ReadLocationV1 => "esi-location.read_location.v1",
            EsiScope::ReadShipTypeV1 => "esi-location.read_ship_type.v1",
            EsiScope::ReadOnlineV1 => "esi-location.read_online.v1",
            EsiScope::OrganizeMailV1 => "esi-mail.organize_mail.v1",
            EsiScope::ReadMailV1 => "esi-mail.read_mail.v1",
            EsiScope::SendMailV1 => "esi-mail.send_mail.v1",
            EsiScope::ReadSkillsV1 => "esi-skills.read_skills.v1",
            EsiScope::ReadSkillqueueV1 => "esi-skills.read_skillqueue.v1",
            EsiScope::ReadCharacterWalletV1 => "esi-wallet.read_character_wallet.v1",
            EsiScope::ReadCorporationWalletV1 => "esi-wallet.read_corporation_wallet.v1",
            EsiScope::ReadCorporationWalletsV1 => "esi-wallet.read_corporation_wallets.v1",
            EsiScope::SearchStructuresV1 => "esi-search.search_structures.v1",
            EsiScope::ReadClonesV1 => "esi-clones.read_clones.v1",
            EsiScope::ReadImplantsV1 => "esi-clones.read_implants.v1",
            EsiScope::ReadCharacterContactsV1 => "esi-characters.read_contacts.v1",
            EsiScope::WriteCharacterContactsV1 => "esi-characters.write_contacts.v1",
            EsiScope::ReadCharacterLoyaltyV1 => "esi-characters.read_loyalty.v1",
            EsiScope::ReadCharacterChatChannelsV1 => "esi-characters.read_chat_channels.v1",
            EsiScope::ReadCharacterMedalsV1 => "esi-characters.read_medals.v1",
            EsiScope::ReadCharacterStandingsV1 => "esi-characters.read_standings.v1",
            EsiScope::ReadAgentsResearchV1 => "esi-characters.read_agents_research.v1",
            EsiScope::ReadCharacterBlueprintsV1 => "esi-characters.read_blueprints.v1",
            EsiScope::ReadCharacterCorporationRolesV1 => "esi-characters.read_corporation_roles.v1",
            EsiScope::ReadCharacterFatigueV1 => "esi-characters.read_fatigue.v1",
            EsiScope::ReadCharacterNotificationsV1 => "esi-characters.read_notifications.v1",
            EsiScope::ReadCharacterTitlesV1 => "esi-characters.read_titles.v1",
            EsiScope::ReadCharacterFwStatsV1 => "esi-characters.read_fw_stats.v1",
            EsiScope::ReadCharacterFreelanceJobsV1 => "esi-characters.read_freelance_jobs.v1",
            EsiScope::ReadStructuresV1 => "esi-universe.read_structures.v1",
            EsiScope::ReadKillmailsV1 => "esi-killmails.read_killmails.v1",
            EsiScope::ReadCorporationKillmailsV1 => "esi-killmails.read_corporation_killmails.v1",
            EsiScope::ReadCorporationMembershipV1 => {
                "esi-corporations.read_corporation_membership.v1"
            }
            EsiScope::ReadCorporationStructuresV1 => "esi-corporations.read_structures.v1",
            EsiScope::TrackCorporationMembersV1 => "esi-corporations.track_members.v1",
            EsiScope::ReadCorporationDivisionsV1 => "esi-corporations.read_divisions.v1",
            EsiScope::ReadCorporationContactsV1 => "esi-corporations.read_contacts.v1",
            EsiScope::ReadCorporationTitlesV1 => "esi-corporations.read_titles.v1",
            EsiScope::ReadCorporationBlueprintsV1 => "esi-corporations.read_blueprints.v1",
            EsiScope::ReadCorporationStandingsV1 => "esi-corporations.read_standings.v1",
            EsiScope::ReadCorporationStarbasesV1 => "esi-corporations.read_starbases.v1",
            EsiScope::ReadCorporationContainerLogsV1 => "esi-corporations.read_container_logs.v1",
            EsiScope::ReadCorporationFacilitiesV1 => "esi-corporations.read_facilities.v1",
            EsiScope::ReadCorporationMedalsV1 => "esi-corporations.read_medals.v1",
            EsiScope::ReadCorporationFwStatsV1 => "esi-corporations.read_fw_stats.v1",
            EsiScope::ReadCorporationProjectsV1 => "esi-corporations.read_projects.v1",
            EsiScope::ReadCorporationFreelanceJobsV1 => "esi-corporations.read_freelance_jobs.v1",
            EsiScope::ReadAssetsV1 => "esi-assets.read_assets.v1",
            EsiScope::ReadCorporationAssetsV1 => "esi-assets.read_corporation_assets.v1",
            EsiScope::ManagePlanetsV1 => "esi-planets.manage_planets.v1",
            EsiScope::ReadCustomsOfficesV1 => "esi-planets.read_customs_offices.v1",
            EsiScope::ReadFleetV1 => "esi-fleets.read_fleet.v1",
            EsiScope::WriteFleetV1 => "esi-fleets.write_fleet.v1",
            EsiScope::OpenWindowV1 => "esi-ui.open_window.v1",
            EsiScope::WriteWaypointV1 => "esi-ui.write_waypoint.v1",
            EsiScope::ReadFittingsV1 => "esi-fittings.read_fittings.v1",
            EsiScope::WriteFittingsV1 => "esi-fittings.write_fittings.v1",
            EsiScope::StructureMarketsV1 => "esi-markets.structure_markets.v1",
            EsiScope::ReadCharacterMarketOrdersV1 => "esi-markets.read_character_orders.v1",
            EsiScope::ReadCorporationMarketOrdersV1 => "esi-markets.read_corporation_orders.v1",
            EsiScope::ReadCharacterIndustryJobsV1 => "esi-industry.read_character_jobs.v1",
            EsiScope::ReadCorporationIndustryJobsV1 => "esi-industry.read_corporation_jobs.v1",
            EsiScope::ReadCharacterMiningV1 => "esi-industry.read_character_mining.v1",
            EsiScope::ReadCorporationMiningV1 => "esi-industry.read_corporation_mining.v1",
            EsiScope::ReadCharacterContractsV1 => "esi-contracts.read_character_contracts.v1",
            EsiScope::ReadCorporationContractsV1 => "esi-contracts.read_corporation_contracts.v1",
            EsiScope::ReadAllianceContactsV1 => "esi-alliances.read_contacts.v1",
        }
    }
}

pub const BASE_SCOPES: &[EsiScope] = &[
    EsiScope::ReadSkillsV1,
    EsiScope::ReadSkillqueueV1,
    EsiScope::ReadClonesV1,
    EsiScope::ReadImplantsV1,
    EsiScope::ReadStructuresV1,
];
