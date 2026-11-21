# Sports Insight Bot

A chat app where a cricket-first sports analyst explains matches, situations and images, and shows its answer on an interactive cricket ground.

## Language

### Conversation

**Analyst**:
The bot persona: a sports analyst that answers in a Chat.
_Avoid_: bot, assistant, AI

**Visitor**:
A person who uses the site. A Visitor has no account.
_Avoid_: user, customer

**Chat**:
One conversation between a Visitor and the Analyst, kept in the Visitor's own browser.
_Avoid_: session, thread, conversation

**Message**:
One turn in a Chat, from the Visitor or the Analyst. It can hold text and images.
_Avoid_: prompt, query

**Sport focus**:
The sport, and optionally the team, that a Chat is about. Cricket is the default and has full support; other sports get text answers only.
_Avoid_: mode, context

### Cricket

**Ground**:
The whole playing area, inside the boundary rope.
_Avoid_: pitch, field (for the whole area)

**Pitch**:
The 22-yard strip in the middle of the Ground where the ball is bowled.
_Avoid_: wicket (for the strip), track

**Format**:
The type of match: Test, ODI or T20. The Format sets the fielding restrictions.
_Avoid_: match type, mode

**Phase**:
A part of an innings with its own field rules and tactics: powerplay, middle overs or death overs.
_Avoid_: stage, period

**Batter hand**:
Whether the batter bats right-handed or left-handed. A left-hander's Field placement is the mirror image of a right-hander's.
_Avoid_: stance

**Fielding position**:
A named spot on the Ground for one fielder, such as slip, gully, point or fine leg.
_Avoid_: position, spot, place

**Field placement**:
The set of Fielding positions of all eleven fielders (including the bowler and wicketkeeper) for a ball or a Phase.
_Avoid_: formation, field setting, field

**30-yard circle**:
The marked ring around the Pitch that splits fielders into "inside" and "outside" for Fielding restrictions.
_Avoid_: ring, inner circle

**Fielding restriction**:
A rule that limits where fielders may stand, set by the Format and the Phase, such as the most fielders allowed outside the 30-yard circle or behind square on the leg side.
_Avoid_: field rule, powerplay rule

**Shot**:
One scoring stroke by a batter: the direction the ball went and the runs it made.
_Avoid_: hit, stroke

**Wagon wheel**:
A drawing of a batter's Shots on the Ground, one line from the Pitch per Shot.
_Avoid_: shot map, spray chart

### Board

**Board**:
The interactive view of the Ground where the Analyst shows a Field placement or a Wagon wheel, and the Visitor can change it and ask about it.
_Avoid_: canvas, tactics board, pitch view
