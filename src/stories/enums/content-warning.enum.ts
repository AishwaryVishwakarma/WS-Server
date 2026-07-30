// A fixed, developer-owned safety vocabulary — distinct from Tag (open-ended,
// admin-curated, topic/genre). Shown to readers before/while reading; not a
// discovery axis like tags.
export enum ContentWarning {
  GraphicViolence = 'graphic_violence',
  SelfHarmSuicide = 'self_harm_suicide',
  SexualContent = 'sexual_content',
  AnimalCruelty = 'animal_cruelty',
  ChildHarm = 'child_harm',
  BodyHorror = 'body_horror',
}
