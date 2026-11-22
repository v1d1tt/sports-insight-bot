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

// Starting points for an empty Chat, per sport. Only cricket has the Board,
// so only cricket gets an example that asks for a field.
const EXAMPLE_QUESTIONS: Record<Sport, readonly string[]> = {
  cricket: [
    'Set a field for a leg-spinner on a turning pitch',
    'Who should bowl the 19th over when defending 12?',
    'How do you build an innings on a slow pitch?',
  ],
  football: [
    'How do you beat a high pressing team?',
    'When should a team switch from a back four to a back three?',
    'What makes a good defensive midfielder?',
  ],
  basketball: [
    'How do you break a full-court press?',
    'When should a team switch to a zone defense?',
    'Why do teams take so many three-point shots now?',
  ],
  tennis: [
    'How do you return a big serve on grass?',
    'When should a baseliner come to the net?',
    'Why is clay the hardest surface for big servers?',
  ],
  other: [
    'Explain the basic rules of a sport I am new to',
    'What makes a great team captain in any sport?',
    'How do home crowds affect results?',
  ],
}

export const exampleQuestions = (sport: Sport): readonly string[] => EXAMPLE_QUESTIONS[sport]
