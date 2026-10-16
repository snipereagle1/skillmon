# Alternative ("one of") skill requirements in other EVE planners

Research for [SKI-26](https://linear.app/skillmon/issue/SKI-26/how-do-other-eve-planners-express-alternative-skill-requirements), feeding the choice-group map [SKI-25](https://linear.app/skillmon/issue/SKI-25/map-choice-groups-in-skill-plans). Researched 2026-10-16.

## Answer

No tool surveyed has an alternative or "any one of these" entry. Every plan or requirement list is a flat set of skill levels that must all be trained (an AND list). The time estimate is always the sum over every entry, so no tool ever has to pick an option. Where authors want "pick your race," the tools make one plan per race (CCP's Certified Skill Plans) or leave it to the user to edit the plan. Choice groups would be new to the ecosystem, and no existing file format offers a model to copy.

| Tool                   | Choice concept? | Storage                                                                                     | Time estimate                        |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| EVEMon                 | None            | Ordered `<entry>` list, each one skill at one level; free-text `<group>` tags only          | Simulates every entry in order       |
| EVE client skill plans | None            | Ordered list of skill levels plus up to 5 milestones; format not published, no ESI endpoint | Sum of the listed levels             |
| Pyfa                   | None            | Requirements are a `{skillTypeID: level}` dict per item (all required)                      | No plan timing; lists missing skills |

## EVEMon

Source: [peterhaneve/evemon](https://github.com/peterhaneve/evemon) at commit `7a89038` (2021-03-17, the last commit on the main repository).

- **Plan file format.** `SerializablePlan` has `name`, `owner` and `description` attributes plus `sorting`, repeated `entry` and `invalidEntry` elements ([`SerializablePlan.cs`](https://github.com/peterhaneve/evemon/blob/7a8903818d4073a6ac385e093d656cf8053aefcb/src/EVEMon.Common/Serialization/Settings/SerializablePlan.cs)). Each `entry` is exactly one skill at one level: `skillID`, `skill`, `level`, `priority`, `type`, plus optional `notes`, repeated `group` strings and a `remapping` point ([`SerializablePlanEntry.cs`](https://github.com/peterhaneve/evemon/blob/7a8903818d4073a6ac385e093d656cf8053aefcb/src/EVEMon.Common/Serialization/Settings/SerializablePlanEntry.cs)). There is no element that refers to more than one skill.
- `.emp` files are the same XML, compressed. `ImportFromXML` decompresses `.emp` to a temp file and parses it as XML ([`PlanIOHelper.cs`](https://github.com/peterhaneve/evemon/blob/7a8903818d4073a6ac385e093d656cf8053aefcb/src/EVEMon.Common/Helpers/PlanIOHelper.cs#L327-L347)).
- **`type`** is `Planned` (top-level) or `Prerequisite` (required by another entry) ([`PlanEntryType.cs`](https://github.com/peterhaneve/evemon/blob/7a8903818d4073a6ac385e093d656cf8053aefcb/src/EVEMon.Common/Enumerations/PlanEntryType.cs)). It records why an entry is there. It does not make an entry optional.
- **Plan groups are labels, not choices.** `group` strings are set when plans are merged: each merged entry gets tagged with its source plan's name ([`PlanManagementWindow.cs` L229](https://github.com/peterhaneve/evemon/blob/7a8903818d4073a6ac385e093d656cf8053aefcb/src/EVEMon/SkillPlanner/PlanManagementWindow.cs#L229)). The plan editor only uses them to show a column and a "Select entries from group..." menu ([`PlanEditorControl.cs` L1519-L1528, L1598-L1601](https://github.com/peterhaneve/evemon/blob/7a8903818d4073a6ac385e093d656cf8053aefcb/src/EVEMon/SkillPlanner/PlanEditorControl.cs#L1519-L1601)). Every grouped entry is still trained.
- **Time estimate.** `GetTotalTime` runs a `CharacterScratchpad` over all `Items` in order (`scratchpad.TrainEntries(Items, applyRemappingPoints)`) and returns the accumulated training time ([`BasePlan.cs` L152-L162](https://github.com/peterhaneve/evemon/blob/7a8903818d4073a6ac385e093d656cf8053aefcb/src/EVEMon.Common/Models/BasePlan.cs#L152-L162)). There is no option selection anywhere in this path.
- A search of the source for "alternat", "OneOf" and "anyOf" finds nothing related to plans.

## EVE client (CCP in-game skill plans)

- **Launch.** CCP announced Skill Plans on 2021-08-24: a plan is "an ordered list of skill levels with specific goals." Each character can hold up to ten Personal Skill Plans with any number of skill levels, plus up to five Milestones (an item or skill that completes once its required skills are trained). Plans are shared in chat, mail and bulletins like fittings ([Updates To Skill Training](https://www.eveonline.com/news/view/updates-to-skill-training)).
- **Alternatives are handled by duplicating plans.** CCP's Certified Skill Plans are published "for each ship fitting within each career, per Empire" (same post). Choosing a race means choosing a different plan. There is no option inside a plan.
- **Later additions.** Patch 19.10 (November 2021) lets you drag a fitting into a plan to add its required skills ([Patch Notes 19.10](https://www.eveonline.com/news/view/patch-notes-version-19-10)). The 2021-11-05 post adds clipboard import and export and Corporation Skill Plans ([Building Better Capsuleers](https://www.eveonline.com/news/view/building-better-capsuleers)). None of these posts mentions optional or "one of" skills.
- **Storage.** CCP has not published the plan or clipboard format. ESI has no skill plan endpoint: the only skill paths in the [ESI OpenAPI spec](https://esi.evetech.net/meta/openapi.json) are `/characters/{character_id}/skills` and `/characters/{character_id}/skillqueue` (checked 2026-10-16). Plans live server-side in the client and leave it only as shared links or clipboard text.
- **Time estimate.** The posts describe per-level training times in the plan UI but not an aggregation rule. With an AND-only list, it is the sum of the listed levels.
- The game's own requirement data agrees: an item's required skills are all mandatory (see the SKI-25 note that each hull needs its own racial Cruiser V).

## Pyfa

Source: [pyfa-org/Pyfa](https://github.com/pyfa-org/Pyfa) at commit `3b9ce39` (2026-10-08).

- **Requirements model.** `Item.requiredSkills` parses the item's `reqskills` JSON into a `{skill: level}` dict ([`eos/gamedata.py` L311-L320](https://github.com/pyfa-org/Pyfa/blob/3b9ce39b8bb41bb7e3fbf097f683da9143a48133/eos/gamedata.py#L311-L320)). A dict means all are required; there is no way to express "one of."
- **Output.** For the selected character, Pyfa computes missing skills for a fit (`sCharacter.checkRequirements(fit)`). It copies them as plain `Skill N` or EVEMon-style `Skill IV` lines ([`gui/characterSelection.py` L234, L265-L290](https://github.com/pyfa-org/Pyfa/blob/3b9ce39b8bb41bb7e3fbf097f683da9143a48133/gui/characterSelection.py#L265-L290)). It has no plan file and no training-time estimate of its own.

## Other community tools

None of the other community tools surveyed publishes a plan format with alternatives. They exchange plans as EVEMon XML or as plain "skill level" text, and neither format can express an alternative. EVE University distributes its plans as in-game Certified/corp plans or as lists ([EVE University: Skill Plans](https://wiki.eveuniversity.org/Skill_Plans), a community wiki, cited only for usage). The wiki describes no optional skills either.

## Implications for skillmon

- No compatibility target exists, so skillmon JSON is free to define choice groups its own way. This matches the SKI-25 decision to flatten to the picked option for EVEMon XML and text export: those formats have no field that could carry a group.
- An EVEMon `<group>` tag cannot round-trip a choice group. Reusing it would be misread as a merge label by EVEMon.
- CCP's per-Empire Certified plans are the closest prior art. They show the user need is real ("same plan, your race's hull"), and the existing answer is duplicated plans.
