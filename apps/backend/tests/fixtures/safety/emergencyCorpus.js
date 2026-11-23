// BICC-GATE-009 / SAFE-002: a TUNING corpus for the active-emergency interception, written by the engineer. It is NOT certification evidence (BICC-EVAL-002): the
// prompts were visible while the patterns were tuned. Each row: [message, category]. ACTIVE rows must reach the emergency boundary; every other category must not.
const ACTIVE = [
  // gas / carbon monoxide
  ['i smell gas in the kitchen', 'gas'], ['there is a gas leak in my basement', 'gas'], ['my house smells like rotten eggs', 'gas'], ['i think i have a gas leak', 'gas'],
  ['the gas stove is hissing and i smell gas', 'gas'], ['my co alarm is going off', 'co'], ['the carbon monoxide detector is beeping and we feel dizzy', 'co'], ['co detector just went off in the bedroom', 'co'],
  // fire / smoke
  ['there is a fire in my kitchen', 'fire'], ['my house is on fire', 'fire'], ['the oven is on fire', 'fire'], ['i see flames coming from the attic', 'fire'], ['something is burning in the walls', 'fire'],
  ['the house is filling with smoke', 'smoke'], ['i smell smoke in the basement', 'smoke'], ['smoke is coming from the outlet', 'smoke'], ['my smoke alarm is going off and i smell burning', 'smoke'],
  ['there is smoke coming out of the furnace', 'smoke'], ['the garage is on fire', 'fire'], ['the stove is smoking and flames are spreading', 'fire'],
  // sparking / overheating / live wiring
  ['sparks are coming from the outlet', 'electrical'], ['the electrical panel is sparking', 'electrical'], ['i see sparks from the breaker box', 'electrical'], ['the outlet is hot and smells like burning plastic', 'electrical'],
  ['the panel is smoking', 'electrical'], ['there is an exposed live wire hanging in the garage', 'electrical'], ['a live wire is down in my yard', 'electrical'], ['the wire is sparking in the wall', 'electrical'],
  ['the water heater is overheating and making a loud banging noise', 'overheating'], ['my furnace is overheating and smells like burning', 'overheating'],
  // water near electricity / flooding
  ['my basement is flooding and the outlets are under water', 'flood-electric'], ['water is pouring through the ceiling light fixture', 'flood-electric'], ['actively flooding near the electrical panel', 'flood-electric'],
  ['a pipe just burst', 'flood'], ['my water main burst this morning', 'flood'], ['water is gushing from a pipe in the wall', 'flood'], ['the basement is flooding right now', 'flood'],
  // structural
  ['the ceiling is collapsing', 'structural'], ['the floor is caving in', 'structural'], ['a wall is collapsing in the basement', 'structural'], ['the roof is caving in', 'structural'],
  // other immediate
  ['call 911', 'emergency-call'], ['i need to call 911 my house is flooding', 'emergency-call'], ['someone is breaking in', 'intrusion'],
];
const BENIGN = [
  // educational
  ['what should i do if i smell gas', 'educational'], ['how do i know if i have a gas leak', 'educational'], ['what are the signs of carbon monoxide poisoning', 'educational'], ['how does a co detector work', 'educational'],
  ['why do outlets spark when you plug something in', 'educational'], ['what causes a breaker to overheat', 'educational'], ['how do i shut off the gas in an emergency', 'educational'], ['what is the best way to put out a grease fire', 'educational'],
  ['explain how a fire sprinkler system works', 'educational'], ['how often should i test my smoke alarms', 'educational'],
  // historical
  ['we had a gas leak last year, is it in my records', 'historical'], ['a pipe burst last winter, did i record it', 'historical'], ['my basement flooded in 2019', 'historical'], ['the kitchen fire in 2021 is on my insurance claim', 'historical'],
  ['we smelled smoke last month and the electrician checked it', 'historical'], ['there was a co alarm event in march', 'historical'], ['when did the roof last leak', 'historical'],
  // conditional / hypothetical
  ['if my house caught fire would my insurance cover it', 'conditional'], ['what if a pipe bursts while i am away', 'conditional'], ['suppose there is a gas leak, who do i call', 'conditional'], ['would flood insurance cover a burst pipe', 'conditional'],
  // resolved
  ['the gas leak was fixed yesterday', 'resolved'], ['the fire department cleared the smoke last week and i need the report', 'resolved'], ['the sparking outlet was replaced, please mark that task done', 'resolved'],
  ['the burst pipe has been repaired, update the record', 'resolved'],
  // ordinary maintenance / records nouns
  ['when should i replace my fire extinguisher', 'ordinary'], ['smoke detector battery schedule', 'ordinary'], ['do i need flood insurance', 'ordinary'], ['is my fireplace inspected', 'ordinary'],
  ['how much does a burst pipe claim cost', 'ordinary'], ['fire safety checklist', 'ordinary'], ['gas bill this month', 'ordinary'], ['is there a smoke alarm in each bedroom', 'ordinary'], ['remind me to test the smoke detectors', 'ordinary'],
  ['schedule a co detector check', 'ordinary'], ['add a smoke and co detector check to my maintenance', 'ordinary'], ['how old is my electrical panel', 'ordinary'], ['what is my water heater warranty', 'ordinary'],
  ['my gas furnace is 15 years old, should i replace it', 'ordinary'], ['the roof has a leak stain from the old storm', 'ordinary'], ['how much would a new breaker panel cost', 'ordinary'], ['smoke damage restoration cost estimate', 'ordinary'],
];
module.exports = { ACTIVE, BENIGN };
// Rows added after the first measurement (2026-11-23): an emergency stated beside a question or a framing must stay active; framed text must not fire.
module.exports.ACTIVE.push(
  ['what do i do, i smell gas', 'framed-active'], ['help what should i do about the gas smell in my kitchen', 'framed-active'], ['how do i shut off the gas, there is a gas leak', 'framed-active'],
  ['i think there is a gas leak, what should i do', 'framed-active'], ['the gas leak was fixed but i smell gas again', 'framed-active'], ['i smelled gas a minute ago and it is still here', 'framed-active'],
  ['is it normal for my outlet to be sparking right now', 'framed-active'], ['what is that gas smell in my kitchen', 'framed-active'],
);
module.exports.BENIGN.push(
  ['we smelled gas last year and the utility fixed it', 'historical'], ['if there is ever a fire what is the escape plan for my home', 'conditional'], ['explain what a live wire is', 'educational'],
);
