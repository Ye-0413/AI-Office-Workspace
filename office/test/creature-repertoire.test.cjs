'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Repertoire = require('../renderer/creature-repertoire.js');
const hash = value => require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('every material has ten authored, named choreographies in all eleven observed states', () => {
  const ids = new Set(); let count = 0;
  for (const species of Repertoire.SPECIES) {
    const pack = Repertoire.catalog[species]; assert.equal(pack.species, species);
    assert.deepEqual(Object.keys(pack.states).sort(), [...Repertoire.ACTIVITIES].sort());
    for (const activity of Repertoire.ACTIVITIES) {
      const recipes = Repertoire.recipes(species, activity);
      assert.equal(recipes.length, 10, species + ':' + activity);
      assert.equal(new Set(recipes.map(recipe => recipe.labelZh)).size, 10);
      assert.equal(new Set(recipes.map(recipe => recipe.labelEn)).size, 10);
      // Names, speeds and colours are excluded: ten labels over one movement
      // do not satisfy the material repertoire requirement.
      assert.equal(new Set(recipes.map(recipe => hash({ markup: recipe.markup, tracks: recipe.tracks }))).size, 10);
      for (const recipe of recipes) {
        assert.ok(recipe.id.startsWith(species + '-' + activity + '-')); assert.ok(!ids.has(recipe.id)); ids.add(recipe.id); count++;
        assert.match(recipe.labelZh, /\p{Script=Han}/u); assert.ok(recipe.labelEn.length >= 4); assert.ok(recipe.descriptionZh.length >= 12);
        assert.ok(recipe.beats.length >= 3 && recipe.beats.length <= 5, recipe.id + ' has explicit anticipation/action/hold/return');
        assert.ok(Object.isFrozen(recipe) && Object.isFrozen(recipe.tracks), 'catalogue data is immutable');
        const waiting = ['waiting-tool', 'waiting-user', 'error'].includes(activity);
        assert.ok(recipe.duration >= (waiting ? 6000 : 2600) && recipe.duration <= (waiting ? 9000 : 4200), recipe.id + ': ' + recipe.duration);
        assert.ok(recipe.tracks.length >= 1 && recipe.tracks.length <= 8, recipe.id + ' bounds compositor owners');
        assert.doesNotMatch(recipe.markup, /<(?:script|foreignObject|image|animate|set)\b|\bon\w+\s*=|(?:href|url\()|ca-hand|ca-rotor/i, recipe.id + ' remains local passive SVG');
        const targets = [...recipe.markup.matchAll(/data-motion="([^"]+)"/g)].map(match => match[1]);
        assert.equal(new Set(targets).size, targets.length, recipe.id + ' has unambiguous target names');
        assert.equal(new Set(recipe.tracks.map(track => track.part)).size, recipe.tracks.length, recipe.id + ' has one owner per transform');
        for (const track of recipe.tracks) {
          assert.ok(track.part === '$body' || targets.includes(track.part), recipe.id + ': missing ' + track.part);
          assert.ok(Object.hasOwn(Repertoire.EASINGS, track.easing));
          assert.ok(track.keyframes.length >= 2 && track.keyframes.length <= 40);
          assert.equal(track.keyframes[0].offset, 0); assert.equal(track.keyframes.at(-1).offset, 1);
          let offset = -1;
          for (const frame of track.keyframes) {
            assert.ok(frame.offset >= offset && frame.offset <= 1); offset = frame.offset;
            assert.ok(Object.keys(frame).every(key => ['offset', 'transform', 'opacity', 'easing'].includes(key)), recipe.id + ' uses compositor properties only');
            if (frame.transform) assert.doesNotMatch(frame.transform, /(?:NaN|Infinity|undefined|scale\(0\))/);
            if (frame.opacity !== undefined) assert.ok(Number(frame.opacity) >= 0 && Number(frame.opacity) <= 1);
          }
        }
      }
    }
  }
  assert.equal(count, 550);
});

test('each real identity visits all ten variations before repeating, independent of metadata and colour', () => {
  for (const activity of Repertoire.ACTIVITIES) {
    for (let family = 0; family < 50; family++) {
      const identity = 'codex:session-with-full-id-' + family;
      const order = Repertoire.orderFor(identity, activity);
      assert.equal(order.length, 10); assert.deepEqual([...order].sort((a, b) => a - b), [0,1,2,3,4,5,6,7,8,9]);
      assert.deepEqual(Repertoire.orderFor(identity, activity), order);
      let cursor = Repertoire.select('folio', activity, identity), visited = [];
      for (let index = 0; index < 10; index++) { visited.push(cursor.index); cursor = Repertoire.next('folio', activity, cursor); }
      assert.deepEqual(visited, order); assert.equal(cursor.index, order[0]);
    }
  }
  assert.notDeepEqual(Repertoire.orderFor('provider-a:identity', 'coding'), Repertoire.orderFor('provider-b:identity', 'coding'));
});

test('visible time restores the same choreography and finite cycles close before the next variation', () => {
  for (const species of Repertoire.SPECIES) for (const activity of Repertoire.ACTIVITIES) {
    let elapsed = 0, first = Repertoire.select(species, activity, 'full:identity'), current = first;
    for (let index = 0; index < 10; index++) {
      const span = current.recipe.duration * current.repeat;
      const middle = Repertoire.select(species, activity, 'full:identity', elapsed + span / 2);
      assert.equal(middle.index, current.index); assert.equal(middle.phase, span / 2);
      assert.equal(Repertoire.select(species, activity, 'full:identity', elapsed + span - .01).index, current.index);
      elapsed += span; current = Repertoire.next(species, activity, current);
      assert.equal(Repertoire.select(species, activity, 'full:identity', elapsed).index, current.index);
    }
    assert.equal(current.index, first.index);
    for (const invalid of [-100, NaN, Infinity]) assert.equal(Repertoire.select(species, activity, 'full:identity', invalid).index, first.index);
    for (let index = 0; index < 10; index++) {
      const preview = Repertoire.select(species, activity, 'full:identity', 999999, index);
      assert.equal(preview.index, index); assert.equal(preview.phase, 0); assert.equal(preview.preview, true);
    }
  }
  assert.equal(Repertoire.select('missing', 'reading'), null); assert.equal(Repertoire.select('folio', 'unknown'), null);
});

test('repertoire playback has no timer, frame loop, network or state-writing side channel', () => {
  for (const name of ['creature-repertoire', 'creature-activity', ...Repertoire.SPECIES.map(species => 'repertoire-' + species)]) {
    const source = fs.readFileSync(path.join(__dirname, '../renderer/' + name + '.js'), 'utf8');
    assert.doesNotMatch(source, /\b(?:requestAnimationFrame|setTimeout|setInterval|fetch|XMLHttpRequest)\s*\(/);
    assert.doesNotMatch(source, /(?:office:answer-question|office:connect|office:open-source)/);
  }
});
