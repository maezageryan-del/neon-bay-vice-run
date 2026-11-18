// A small seeded random number generator (mulberry32): the same seed gives
// the same city, the same traffic and the same screenshot scenes, which is
// what makes the whole game deterministic and the shots repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random helpers built on a mulberry32 stream. */
export function createRng(seed) {
  const random = createRandom(seed);
  return {
    random,
    /** Float in [min, max). */
    range(min, max) { return min + random() * (max - min); },
    /** Integer in [min, max] inclusive. */
    int(min, max) { return min + Math.floor(random() * (max - min + 1)); },
    /** One element of a non-empty array. */
    pick(list) { return list[Math.floor(random() * list.length)]; },
    /** True with probability p. */
    chance(p) { return random() < p; },
  };
}
