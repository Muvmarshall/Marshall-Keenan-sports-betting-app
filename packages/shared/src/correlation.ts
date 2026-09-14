import type { CorrelationFlag, SlipLegInput } from './types.js';

/**
 * Flag only — never scored, per product spec. These are heuristics that catch
 * the common "same bet twice" patterns on a pick'em slip, not a covariance model.
 */
export function detectCorrelations(legs: SlipLegInput[]): CorrelationFlag[] {
  const flags: CorrelationFlag[] = [];

  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i];
      const b = legs[j];
      if (!a.team || !b.team || a.team !== b.team) continue;

      // Same-team QB passing yards + that team's receiver yards, same direction.
      const passRec =
        (a.statType === 'pass_yds' && b.statType === 'rec_yds') ||
        (a.statType === 'rec_yds' && b.statType === 'pass_yds');
      if (passRec && a.side === b.side) {
        flags.push({
          legIds: [a.id, b.id],
          reason:
            'These two legs move together. Your real probability is higher than the independent calculation shows — and so is your variance.',
        });
        continue;
      }

      // A player's rushing over + that team's team-total under.
      const rushVsTeamTotal =
        (a.statType === 'rush_yds' && a.side === 'over' && b.statType === 'team_total' && b.side === 'under') ||
        (b.statType === 'rush_yds' && b.side === 'over' && a.statType === 'team_total' && a.side === 'under');
      if (rushVsTeamTotal) {
        flags.push({
          legIds: [a.id, b.id],
          reason:
            'These two legs move together. Your real probability is higher than the independent calculation shows — and so is your variance.',
        });
        continue;
      }

      // Two receivers on the same team, both overs.
      const twoReceiversBothOver =
        a.position === 'WR' &&
        b.position === 'WR' &&
        a.statType === 'rec_yds' &&
        b.statType === 'rec_yds' &&
        a.side === 'over' &&
        b.side === 'over';
      if (twoReceiversBothOver) {
        flags.push({
          legIds: [a.id, b.id],
          reason:
            'These two legs move together. Your real probability is higher than the independent calculation shows — and so is your variance.',
        });
      }
    }
  }

  return flags;
}
