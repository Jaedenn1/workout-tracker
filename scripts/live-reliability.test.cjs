const assert = require('node:assert/strict');
const {
  clampLiveDuration,
  clampLiveRpe,
  completedLiveSetCount,
  intervalPaceSignal,
  nextSetRecommendation,
  plannedLiveSetCount,
  validLiveSet,
} = require('../.tmp-live-test/lib/liveTraining.js');

function set(id, weight, reps, rir, done = true) {
  return { id, weight, reps, rir, done };
}

function exercise(overrides = {}) {
  return {
    id: 'test-lift',
    name: 'Test Lift',
    muscle: 'Chest',
    repMin: 6,
    repMax: 10,
    increment: 5,
    fallbackWeight: 100,
    sets: [],
    ...overrides,
  };
}

assert.equal(clampLiveDuration(-50, 45), 5, 'duration clamps low values');
assert.equal(clampLiveDuration(999, 45), 300, 'duration clamps high values');
assert.equal(clampLiveDuration('bad', 35), 35, 'duration uses fallback for malformed input');
assert.equal(clampLiveRpe(7.24, 6), 7, 'RPE rounds to half steps');
assert.equal(clampLiveRpe(11, 6), 10, 'RPE clamps high values');

assert.equal(validLiveSet(set('blank', 100, null, 2)), false, 'blank reps cannot count as completed');
assert.equal(validLiveSet(set('negative', -5, 8, 2)), false, 'negative weight is invalid');
assert.equal(validLiveSet(set('bad-rir', 100, 8, 7)), false, 'RIR above 6 is invalid');
assert.equal(validLiveSet(set('good', 100, 8, 2)), true, 'valid set is counted');

const skippedPartial = exercise({ skipped: true, sets: [set('a', 100, 8, 2), set('b', 100, null, null, false), set('c', 100, null, null, false)] });
const active = exercise({ id: 'active', sets: [set('d', 80, null, null, false), set('e', 80, null, null, false)] });
assert.equal(completedLiveSetCount([skippedPartial, active]), 1, 'only valid completed sets count');
assert.equal(plannedLiveSetCount([skippedPartial, active]), 3, 'skipped unfinished sets are removed from the dose denominator without erasing completed work');

assert.equal(intervalPaceSignal(100, []).tone, 'neutral', 'first interval has no false pace warning');
assert.equal(intervalPaceSignal(94, [100, 101]).tone, 'warn', 'materially faster interval is flagged');
assert.equal(intervalPaceSignal(108, [100, 101]).tone, 'warn', 'materially slower interval is flagged');
assert.equal(intervalPaceSignal(101, [100, 102]).tone, 'neutral', 'stable interval stays neutral');

const lowRirExercise = exercise({
  sets: [
    set('done', 100, 8, 1, true),
    set('next', 100, null, null, false),
  ],
});
const recommendation = nextSetRecommendation(lowRirExercise, 8);
assert.equal(recommendation.weight, 95, 'low-RIR set produces a structured load reduction');
assert.ok(recommendation.restSeconds >= 60, 'rest recommendation remains bounded');

console.log('Live Training reliability checks passed.');
