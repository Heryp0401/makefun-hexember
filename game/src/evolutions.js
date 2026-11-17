// HEXEMBER — evolutions.js (Builder B)
// 2 evolutions per tower = 10 forms. Pure logic, no three.js / DOM.
// Mods are ABSOLUTE replacement values for the named stat (not deltas):
// e.g. arcConductor sets chain to 4 and dmg to 18 (replacing base 2 / 12).
// Flag mods (burnSpread, priority, slow, shells, lumenPerSec, dmgAura)
// are added alongside the base stats. Evolution cost = 75% of the base
// tower cost, rounded (prism 38, heliotrope 56, lance 75, mortar 94,
// pylonSuar 45). Boons are never applied here.
// The sim (sim.js evolveTower + effStats) owns the live application;
// this module is the data table it reads.

export const EVOLUTIONS = {
  prism: [
    {
      id: 'arcConductor', name: 'Arc Conductor', cost: 38,
      desc: 'Chain lightning arcs to 4 targets with heavier 18-damage bolts.',
      mods: { chain: 4, dmg: 18 },
    },
    {
      id: 'gatlingSpire', name: 'Gatling Spire', cost: 38,
      desc: 'Rapid-fire crystal spire: 5 shots/s at 8 damage each.',
      mods: { rate: 5, dmg: 8 },
    },
  ],
  heliotrope: [
    {
      id: 'solarObelisk', name: 'Solar Obelisk', cost: 56,
      desc: 'Blazing beam: 35 dps, burn still lights tiles for 4s.',
      mods: { dps: 35 },
    },
    {
      id: 'flareProjector', name: 'Flare Projector', cost: 56,
      desc: 'Burn spreads to enemies adjacent to the beam target, lighting their tiles too.',
      mods: { burnSpread: true },
    },
  ],
  lance: [
    {
      id: 'zenithRailgun', name: 'Zenith Railgun', cost: 75,
      desc: '150-damage rail shot that pierces through 2 extra enemies.',
      mods: { dmg: 150, pierce: 2 },
    },
    {
      id: 'beaconSeeker', name: 'Beacon Seeker', cost: 75,
      desc: 'Faster 80-damage shots (0.8/s) that hunt Snuffers and Stalkers first.',
      mods: { dmg: 80, rate: 0.8, priority: ['snuffer', 'stalker'] },
    },
  ],
  mortar: [
    {
      id: 'seismicCore', name: 'Seismic Core', cost: 94,
      desc: '70-damage shells, wider 1.5 blast, and a 0.5 slow on hit.',
      mods: { dmg: 70, aoe: 1.5, slow: 0.5 },
    },
    {
      id: 'novaCluster', name: 'Nova Cluster', cost: 94,
      desc: 'Fires 3 shells at 3 targets, 30 damage each.',
      mods: { shells: 3, dmg: 30 },
    },
  ],
  pylonSuar: [
    {
      id: 'sanctuarySpire', name: 'Sanctuary Spire', cost: 45,
      desc: 'Wider 3-tile aura that also generates +2 Lumen/s.',
      mods: { auraRadius: 3, range: 3, lumenPerSec: 2 },
    },
    {
      id: 'amplifierNode', name: 'Amplifier Node', cost: 45,
      desc: 'Aura boosts nearby towers: +25% damage aura within 2 tiles.',
      mods: { auraRadius: 2, range: 2, dmgAura: 0.25 },
    },
  ],
};
