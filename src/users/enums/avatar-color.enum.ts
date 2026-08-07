// A curated background-color choice for a member's avatar (icon or initial
// letter) — an explicit override of the deterministic name-based color the
// frontend otherwise hashes to. Values mirror the WS-Web theme's named
// accent tokens (`--color-<name>`/`-soft`), so every choice stays on-brand
// rather than an arbitrary hex value. Always available, same as AvatarIcon —
// not gated by any SiteSettings toggle.
export enum AvatarColor {
  Ember = 'ember',
  Spectral = 'spectral',
  Blood = 'blood',
  Success = 'success',
  Warning = 'warning',
}
