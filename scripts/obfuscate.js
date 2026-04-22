// Deterministic label obfuscation for imported graph data.
// Keeps account code structure intact; replaces client names with
// consistent fake institutional names stored in nameMap.json.

const fs = require('fs');
const path = require('path');

const NAME_MAP_PATH = path.join(__dirname, 'nameMap.json');

// Fixed digit substitution cipher (0-9 → 0-9, bijective)
const DIGIT_MAP = { '0':'7','1':'4','2':'9','3':'2','4':'6','5':'1','6':'8','7':'3','8':'5','9':'0' };

// Fixed A-Z substitution cipher (bijective)
const UPPER_MAP = {
  A:'K', B:'P', C:'R', D:'M', E:'X', F:'Q', G:'W', H:'S', I:'N', J:'V',
  K:'A', L:'Z', M:'D', N:'I', O:'F', P:'B', Q:'Y', R:'C', S:'H', T:'U',
  U:'T', V:'J', W:'G', X:'E', Y:'L', Z:'O'
};

// Word bank for generating realistic fake institutional names
const WORD_BANK = {
  place:  ['Meridian', 'Westbrook', 'Oakfield', 'Hartwell', 'Clearwater',
            'Stonegate', 'Ashford', 'Bridgeport', 'Lakeview', 'Millbrook',
            'Ridgecrest', 'Fairhaven', 'Pinehurst', 'Elmwood', 'Crestwood'],
  type:   ['State', 'Municipal', 'County', 'Regional', 'Public', 'City', 'Metro'],
  suffix: ["Employees' Retirement System", 'Pension Fund', 'Retirement Plan',
            'Employee Retirement System', 'Retirement Fund', 'Benefit Plan'],
};

// Load the name map from disk; return empty object if not found.
function loadNameMap() {
  try {
    return JSON.parse(fs.readFileSync(NAME_MAP_PATH, 'utf8'));
  } catch {
    return {};
  }
}

// Save the name map to disk.
function saveNameMap(nameMap) {
  fs.writeFileSync(NAME_MAP_PATH, JSON.stringify(nameMap, null, 2) + '\n');
}

// Scramble a single character (digit or letter); leave others unchanged.
function scrambleChar(ch) {
  if (DIGIT_MAP[ch]) return DIGIT_MAP[ch];
  const up = ch.toUpperCase();
  if (UPPER_MAP[up]) {
    const mapped = UPPER_MAP[up];
    return ch === ch.toUpperCase() ? mapped : mapped.toLowerCase();
  }
  return ch;
}

// Deterministically scramble an account code string.
// Digits and letters are substituted; dashes, spaces, colons etc. are preserved.
function scrambleCode(code) {
  return code.split('').map(scrambleChar).join('');
}

// Build an abbreviation from the initials of a multi-word name.
function makeAbbrev(name) {
  return name
    .split(/\s+/)
    .filter(w => /^[A-Z]/.test(w))
    .map(w => w[0])
    .join('');
}

// Pick a word from a bank array using a simple deterministic index based on the seed string.
function pick(arr, seed, offset = 0) {
  let hash = offset;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[hash % arr.length];
}

// Look up an existing fake name for `realName`, or generate one and store it.
// `nameMap` is mutated in place; caller must call saveNameMap() when done.
function getOrCreateFakeName(realName, nameMap) {
  if (nameMap[realName]) return nameMap[realName];

  const place  = pick(WORD_BANK.place,  realName, 0);
  const type   = pick(WORD_BANK.type,   realName, 1);
  const suffix = pick(WORD_BANK.suffix, realName, 2);

  const fakeName = `${place} ${type} ${suffix}`;
  const abbrev   = makeAbbrev(fakeName);

  nameMap[realName] = fakeName;
  // Also store an abbrev version so labels like "(MPERS)" get a matching fake abbrev
  nameMap[`__abbrev__${realName}`] = abbrev;

  return fakeName;
}

// Build a list of regex patterns to try replacing, from longest to shortest.
// This handles cases where labels use abbreviated variants of the client name
// (e.g. "Retire System" instead of "Retirement System").
function buildNamePatterns(realBaseName) {
  const words = realBaseName.split(/\s+/);
  const patterns = [];
  // Try progressively shorter prefixes (minimum 2 words)
  for (let len = words.length; len >= 2; len--) {
    const phrase = words.slice(0, len).join(' ');
    patterns.push(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }
  return patterns;
}

// Replace the first matching name pattern in a description string.
function replaceClientName(description, patterns, fakeName) {
  for (const pat of patterns) {
    const replaced = description.replace(new RegExp(pat, 'gi'), fakeName);
    if (replaced !== description) return replaced; // stop at first match
  }
  return description;
}

// Obfuscate a single node label given the graph's real base name and the name map.
// realBaseName: the client name extracted from the group-1 root node (no account code prefix)
function obfuscateLabel(realLabel, realBaseName, nameMap) {
  const fakeName   = nameMap[realBaseName] || realLabel;
  const fakeAbbrev = nameMap[`__abbrev__${realBaseName}`] || '';
  const patterns   = buildNamePatterns(realBaseName);
  const realAbbrev = makeAbbrev(realBaseName);

  function applyReplacements(text) {
    let result = replaceClientName(text, patterns, fakeName);
    if (fakeAbbrev && realAbbrev) {
      result = result.replace(new RegExp(`\\(${realAbbrev}\\)`, 'g'), `(${fakeAbbrev})`);
    }
    return result;
  }

  // Split off an account code prefix ("XXXXX: remainder")
  const colonIdx = realLabel.indexOf(': ');
  if (colonIdx !== -1) {
    const code        = realLabel.slice(0, colonIdx);
    const description = realLabel.slice(colonIdx + 2);
    return `${scrambleCode(code)}: ${applyReplacements(description)}`;
  }

  // No code prefix — root client name label.
  return applyReplacements(realLabel);
}

// Extract the base client name from a group-1 node label.
// Strips abbreviations in parentheses, e.g. "MoDOT & Patrol ... (MPERS)" → "MoDOT & Patrol ..."
function extractBaseName(rootLabel) {
  return rootLabel.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

module.exports = { loadNameMap, saveNameMap, getOrCreateFakeName, obfuscateLabel, extractBaseName, scrambleCode };
