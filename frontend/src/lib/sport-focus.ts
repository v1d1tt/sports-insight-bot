// The Sport focus: the sport, and optionally the team, that a Chat is about.
// It is saved with each Chat and sent with each request (as `sport_focus`).

export const SPORTS = [
  { value: 'cricket', label: 'Cricket' },
  { value: 'football', label: 'Football' },
  { value: 'basketball', label: 'Basketball' },
  { value: 'tennis', label: 'Tennis' },
  { value: 'other', label: 'Other' },
] as const

export type Sport = (typeof SPORTS)[number]['value']

export interface SportFocus {
  sport: Sport
  /** Free text, up to 60 characters; empty when no team is set. */
  team: string
}

/** The server takes team names up to this length. */
export const MAX_TEAM_LENGTH = 60

export const DEFAULT_SPORT_FOCUS: SportFocus = { sport: 'cricket', team: '' }
