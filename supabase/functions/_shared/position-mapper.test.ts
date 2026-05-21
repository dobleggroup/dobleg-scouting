// supabase/functions/_shared/position-mapper.test.ts

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { mapGridToPosition, parseFormationLines, assignLineRoles } from './position-mapper.ts';

// --- parseFormationLines ---
Deno.test('parseFormationLines: 4-3-3', () => {
  assertEquals(parseFormationLines('4-3-3'), [4, 3, 3]);
});
Deno.test('parseFormationLines: 4-2-3-1', () => {
  assertEquals(parseFormationLines('4-2-3-1'), [4, 2, 3, 1]);
});
Deno.test('parseFormationLines: 3-5-2', () => {
  assertEquals(parseFormationLines('3-5-2'), [3, 5, 2]);
});

// --- assignLineRoles ---
Deno.test('assignLineRoles: 4-3-3 => DEF, MID, ATK', () => {
  assertEquals(assignLineRoles([4, 3, 3]), ['DEF', 'MID', 'ATK']);
});
Deno.test('assignLineRoles: 4-2-3-1 => DEF, MID_DEF, MID_ATK, ATK', () => {
  assertEquals(assignLineRoles([4, 2, 3, 1]), ['DEF', 'MID_DEF', 'MID_ATK', 'ATK']);
});
Deno.test('assignLineRoles: 3-5-2 => DEF, MID, ATK', () => {
  assertEquals(assignLineRoles([3, 5, 2]), ['DEF', 'MID', 'ATK']);
});
Deno.test('assignLineRoles: 4-1-4-1 => DEF, MID_DEF, MID_ATK, ATK', () => {
  assertEquals(assignLineRoles([4, 1, 4, 1]), ['DEF', 'MID_DEF', 'MID_ATK', 'ATK']);
});
Deno.test('assignLineRoles: 5-3-2 => DEF, MID, ATK', () => {
  assertEquals(assignLineRoles([5, 3, 2]), ['DEF', 'MID', 'ATK']);
});
Deno.test('assignLineRoles: 4-3-1-2 => DEF, MID, MID_ATK, ATK', () => {
  assertEquals(assignLineRoles([4, 3, 1, 2]), ['DEF', 'MID', 'MID_ATK', 'ATK']);
});
Deno.test('assignLineRoles: 5-4-1 => DEF, MID, ATK', () => {
  assertEquals(assignLineRoles([5, 4, 1]), ['DEF', 'MID', 'ATK']);
});

// --- mapGridToPosition: 4-3-3 ---
Deno.test('4-3-3: row 2 col 1 = LI', () => {
  assertEquals(mapGridToPosition('4-3-3', '2:1'), 'LI');
});
Deno.test('4-3-3: row 2 col 2 = CB', () => {
  assertEquals(mapGridToPosition('4-3-3', '2:2'), 'CB');
});
Deno.test('4-3-3: row 2 col 3 = CB', () => {
  assertEquals(mapGridToPosition('4-3-3', '2:3'), 'CB');
});
Deno.test('4-3-3: row 2 col 4 = LD', () => {
  assertEquals(mapGridToPosition('4-3-3', '2:4'), 'LD');
});
Deno.test('4-3-3: row 3 col 1 = VI', () => {
  assertEquals(mapGridToPosition('4-3-3', '3:1'), 'VI');
});
Deno.test('4-3-3: row 3 col 2 = VC', () => {
  assertEquals(mapGridToPosition('4-3-3', '3:2'), 'VC');
});
Deno.test('4-3-3: row 3 col 3 = VI', () => {
  assertEquals(mapGridToPosition('4-3-3', '3:3'), 'VI');
});
Deno.test('4-3-3: row 4 col 1 = EXT', () => {
  assertEquals(mapGridToPosition('4-3-3', '4:1'), 'EXT');
});
Deno.test('4-3-3: row 4 col 2 = DEL', () => {
  assertEquals(mapGridToPosition('4-3-3', '4:2'), 'DEL');
});
Deno.test('4-3-3: row 4 col 3 = EXT', () => {
  assertEquals(mapGridToPosition('4-3-3', '4:3'), 'EXT');
});

// --- mapGridToPosition: 4-2-3-1 ---
Deno.test('4-2-3-1: row 2 col 1 = LI', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '2:1'), 'LI');
});
Deno.test('4-2-3-1: row 2 col 4 = LD', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '2:4'), 'LD');
});
Deno.test('4-2-3-1: row 3 col 1 = VC', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '3:1'), 'VC');
});
Deno.test('4-2-3-1: row 3 col 2 = VC', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '3:2'), 'VC');
});
Deno.test('4-2-3-1: row 4 col 1 = EXT (left)', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '4:1'), 'EXT');
});
Deno.test('4-2-3-1: row 4 col 2 = VI (enganche)', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '4:2'), 'VI');
});
Deno.test('4-2-3-1: row 4 col 3 = EXT (right)', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '4:3'), 'EXT');
});
Deno.test('4-2-3-1: row 5 col 1 = DEL', () => {
  assertEquals(mapGridToPosition('4-2-3-1', '5:1'), 'DEL');
});

// --- mapGridToPosition: 3-5-2 ---
Deno.test('3-5-2: row 2 col 1 = CB', () => {
  assertEquals(mapGridToPosition('3-5-2', '2:1'), 'CB');
});
Deno.test('3-5-2: row 2 col 3 = CB', () => {
  assertEquals(mapGridToPosition('3-5-2', '2:3'), 'CB');
});
Deno.test('3-5-2: row 3 col 1 = LI (carrilero)', () => {
  assertEquals(mapGridToPosition('3-5-2', '3:1'), 'LI');
});
Deno.test('3-5-2: row 3 col 5 = LD (carrilero)', () => {
  assertEquals(mapGridToPosition('3-5-2', '3:5'), 'LD');
});
Deno.test('3-5-2: row 3 col 3 = VC', () => {
  assertEquals(mapGridToPosition('3-5-2', '3:3'), 'VC');
});
Deno.test('3-5-2: row 3 col 2 = VI', () => {
  assertEquals(mapGridToPosition('3-5-2', '3:2'), 'VI');
});
Deno.test('3-5-2: row 3 col 4 = VI', () => {
  assertEquals(mapGridToPosition('3-5-2', '3:4'), 'VI');
});
Deno.test('3-5-2: row 4 col 1 = DEL', () => {
  assertEquals(mapGridToPosition('3-5-2', '4:1'), 'DEL');
});
Deno.test('3-5-2: row 4 col 2 = DEL', () => {
  assertEquals(mapGridToPosition('3-5-2', '4:2'), 'DEL');
});

// --- mapGridToPosition: 5-3-2 ---
Deno.test('5-3-2: row 2 col 1 = LI', () => {
  assertEquals(mapGridToPosition('5-3-2', '2:1'), 'LI');
});
Deno.test('5-3-2: row 2 col 5 = LD', () => {
  assertEquals(mapGridToPosition('5-3-2', '2:5'), 'LD');
});
Deno.test('5-3-2: row 2 col 3 = CB', () => {
  assertEquals(mapGridToPosition('5-3-2', '2:3'), 'CB');
});

// --- mapGridToPosition: 4-4-2 ---
Deno.test('4-4-2: row 3 col 1 = VI (not EXT, midfield line)', () => {
  assertEquals(mapGridToPosition('4-4-2', '3:1'), 'VI');
});
Deno.test('4-4-2: row 3 col 2 = VC', () => {
  assertEquals(mapGridToPosition('4-4-2', '3:2'), 'VC');
});
Deno.test('4-4-2: row 4 col 1 = DEL', () => {
  assertEquals(mapGridToPosition('4-4-2', '4:1'), 'DEL');
});
Deno.test('4-4-2: row 4 col 2 = DEL', () => {
  assertEquals(mapGridToPosition('4-4-2', '4:2'), 'DEL');
});

// --- GK always ARQ ---
Deno.test('row 1 = ARQ regardless of formation', () => {
  assertEquals(mapGridToPosition('4-3-3', '1:1'), 'ARQ');
  assertEquals(mapGridToPosition('3-5-2', '1:1'), 'ARQ');
  assertEquals(mapGridToPosition('4-2-3-1', '1:1'), 'ARQ');
});

// --- Fallback ---
Deno.test('null grid returns null', () => {
  assertEquals(mapGridToPosition('4-3-3', null), null);
});
Deno.test('null formation returns null', () => {
  assertEquals(mapGridToPosition(null, '2:1'), null);
});

// --- 4-1-4-1 ---
Deno.test('4-1-4-1: row 3 col 1 = VC (single pivot)', () => {
  assertEquals(mapGridToPosition('4-1-4-1', '3:1'), 'VC');
});
Deno.test('4-1-4-1: row 4 col 1 = EXT (wide MID_ATK)', () => {
  assertEquals(mapGridToPosition('4-1-4-1', '4:1'), 'EXT');
});
Deno.test('4-1-4-1: row 4 col 2 = VI', () => {
  assertEquals(mapGridToPosition('4-1-4-1', '4:2'), 'VI');
});
Deno.test('4-1-4-1: row 4 col 3 = VI', () => {
  assertEquals(mapGridToPosition('4-1-4-1', '4:3'), 'VI');
});
Deno.test('4-1-4-1: row 4 col 4 = EXT', () => {
  assertEquals(mapGridToPosition('4-1-4-1', '4:4'), 'EXT');
});
