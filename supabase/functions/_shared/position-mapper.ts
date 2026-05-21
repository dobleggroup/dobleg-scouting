// supabase/functions/_shared/position-mapper.ts

import type { Position, LineRole } from './types.ts';

export function parseFormationLines(formation: string): number[] {
  return formation.split('-').map(Number);
}

export function assignLineRoles(lines: number[]): LineRole[] {
  if (lines.length === 3) {
    return ['DEF', 'MID', 'ATK'];
  }

  if (lines.length === 4) {
    const [l1, l2, l3, l4] = lines;

    // 4-2-3-1: DEF, MID_DEF(pivot), MID_ATK(enganche+wings), ATK
    if (l1 >= 4 && l2 <= 2 && l3 >= 3 && l4 <= 1) {
      return ['DEF', 'MID_DEF', 'MID_ATK', 'ATK'];
    }
    // 4-1-4-1: DEF, MID_DEF(single pivot), MID_ATK(4), ATK
    if (l1 >= 4 && l2 === 1 && l3 >= 4 && l4 <= 1) {
      return ['DEF', 'MID_DEF', 'MID_ATK', 'ATK'];
    }
    // 4-3-1-2: DEF, MID, MID_ATK(enganche), ATK
    if (l1 >= 3 && l2 >= 3 && l3 <= 2 && l4 >= 2) {
      return ['DEF', 'MID', 'MID_ATK', 'ATK'];
    }

    return ['DEF', 'MID_DEF', 'MID_ATK', 'ATK'];
  }

  // Fallback for 5+ segments (very rare): first = DEF, last = ATK, middle = MID
  const roles: LineRole[] = ['DEF'];
  for (let i = 1; i < lines.length - 1; i++) roles.push('MID');
  roles.push('ATK');
  return roles;
}

function mapDefLine(col: number, cols: number[]): Position {
  const sorted = [...cols].sort((a, b) => a - b);
  if (sorted.length === 3) return 'CB';
  if (col === sorted[0]) return 'LI';
  if (col === sorted[sorted.length - 1]) return 'LD';
  return 'CB';
}

function mapMidLine(col: number, cols: number[], defLineSize: number): Position {
  const sorted = [...cols].sort((a, b) => a - b);
  const n = sorted.length;

  // 5-man midfield with 3-back: wide players are wing-backs (LD/LI)
  if (n === 5 && defLineSize === 3) {
    if (col === sorted[0]) return 'LI';
    if (col === sorted[n - 1]) return 'LD';
    const mid = Math.floor(n / 2);
    if (col === sorted[mid]) return 'VC';
    return 'VI';
  }

  if (n <= 2) return 'VC';

  if (n === 3) {
    const mid = sorted[1];
    if (col === mid) return 'VC';
    return 'VI';
  }

  // 4-man midfield: 2 central = VC, 2 wide = VI
  if (n === 4) {
    if (col === sorted[0] || col === sorted[n - 1]) return 'VI';
    return 'VC';
  }

  // 5+ without 3-back: center = VC, rest = VI
  const mid = sorted[Math.floor(n / 2)];
  if (col === mid) return 'VC';
  return 'VI';
}

function mapMidDefLine(col: number, cols: number[]): Position {
  const sorted = [...cols].sort((a, b) => a - b);
  if (sorted.length <= 2) return 'VC';
  const mid = sorted[Math.floor(sorted.length / 2)];
  if (col === mid) return 'VC';
  return 'VI';
}

function mapMidAtkLine(col: number, cols: number[]): Position {
  const sorted = [...cols].sort((a, b) => a - b);
  const n = sorted.length;

  if (n === 1) return 'VI'; // enganche
  if (n === 2) return 'VI';

  if (n === 3) {
    // costados = EXT, centro = VI (enganche)
    if (col === sorted[0] || col === sorted[n - 1]) return 'EXT';
    return 'VI';
  }

  if (n === 4) {
    // extremos = EXT, centrales = VI
    if (col === sorted[0] || col === sorted[n - 1]) return 'EXT';
    return 'VI';
  }

  if (col === sorted[0] || col === sorted[n - 1]) return 'EXT';
  return 'VI';
}

function mapAtkLine(col: number, cols: number[]): Position {
  const sorted = [...cols].sort((a, b) => a - b);
  if (sorted.length <= 2) return 'DEL';

  // 3 attackers: wide = EXT, center = DEL
  if (col === sorted[0] || col === sorted[sorted.length - 1]) return 'EXT';
  return 'DEL';
}

export function mapGridToPosition(
  formation: string | null,
  grid: string | null,
): Position | null {
  if (!formation || !grid) return null;

  const [rowStr, colStr] = grid.split(':');
  const row = parseInt(rowStr, 10);
  const col = parseInt(colStr, 10);

  if (row === 1) return 'ARQ';

  const lines = parseFormationLines(formation);
  const roles = assignLineRoles(lines);

  const lineIndex = row - 2; // row 2 = first outfield line (index 0)
  if (lineIndex < 0 || lineIndex >= roles.length) return null;

  const role = roles[lineIndex];
  const lineSize = lines[lineIndex];

  // Build the column list for this row: 1..lineSize
  const cols = Array.from({ length: lineSize }, (_, i) => i + 1);

  const defLineSize = lines[0]; // first outfield line is always DEF

  switch (role) {
    case 'DEF': return mapDefLine(col, cols);
    case 'MID': return mapMidLine(col, cols, defLineSize);
    case 'MID_DEF': return mapMidDefLine(col, cols);
    case 'MID_ATK': return mapMidAtkLine(col, cols);
    case 'ATK': return mapAtkLine(col, cols);
  }
}

export function fallbackPosition(apiPosition: string | null): Position | null {
  switch (apiPosition) {
    case 'G': return 'ARQ';
    case 'D': return 'CB';
    case 'M': return 'VC';
    case 'F': return 'DEL';
    default: return null;
  }
}
