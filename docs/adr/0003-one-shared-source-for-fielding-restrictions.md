# One shared data file for Fielding restrictions

The browser needs the Fielding restrictions for live warnings while the Visitor drags fielders, and the server needs them to check every Field placement the Analyst sends. Instead of writing the limits twice (TypeScript and Python), they live in one data file that both sides read, and both sides run the same shared test cases. This keeps the two checks from drifting apart; the cost is a small loader on each side and a build step that makes the file available to both.
