// Run with: deno run --allow-net --allow-env validate-positions.ts

import { getSupabaseAdmin } from './supabase-client.ts';

const KNOWN_POSITIONS: Array<{ name: string; expected: string; team: string }> = [
  { name: 'Carvajal', expected: 'LD', team: 'Real Madrid' },
  { name: 'Mendy', expected: 'LI', team: 'Real Madrid' },
  { name: 'Koundé', expected: 'LD', team: 'Barcelona' },
  { name: 'Baldé', expected: 'LI', team: 'Barcelona' },
];

async function validate() {
  const supabase = getSupabaseAdmin();

  console.log('=== Position Mapping Validation ===\n');

  for (const { name, expected, team } of KNOWN_POSITIONS) {
    const { data } = await supabase
      .from('player_match_stats')
      .select('detected_position, player_id, players!inner(name)')
      .ilike('players.name', `%${name}%`)
      .limit(5);

    if (!data || data.length === 0) {
      console.log(`❌ ${name} (${team}): No data found`);
      continue;
    }

    const positions = data.map(d => d.detected_position);
    const mostCommon = positions.sort((a, b) =>
      positions.filter(v => v === b).length - positions.filter(v => v === a).length
    )[0];

    const match = mostCommon === expected;
    console.log(`${match ? '✅' : '❌'} ${name} (${team}): expected ${expected}, got ${mostCommon} (${data.length} matches)`);

    if (!match) {
      console.log('   ⚠️  GRID CONVENTION MAY BE INVERTED — check col_min/col_max mapping');
    }
  }
}

validate();
