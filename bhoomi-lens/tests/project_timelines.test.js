const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/project_timelines.js'), 'utf8'), sandbox);
const archive = sandbox.window.BL_PROJECT_TIMELINES;

test('official project reports have distinct identities, source links and valid known dates', () => {
  assert.equal(new Set(archive.projects.map((p) => p.id)).size, archive.projects.length);
  assert.ok(archive.projects.some((p) => p.state === 'Tamil Nadu'));
  assert.ok(archive.projects.some((p) => p.state === 'Maharashtra'));
  for (const project of archive.projects) {
    assert.ok(project.events.length > 0);
    for (const event of project.events) {
      const url = new URL(event.url);
      assert.equal(url.protocol, 'https:');
      assert.equal(url.hostname, 'www.pib.gov.in');
      assert.ok(event.kind && event.detail);
      for (const date of [event.published, event.event].filter(Boolean)) {
        assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
        assert.equal(new Date(date).toISOString().slice(0, 10), date);
        assert.ok(date <= archive.reviewed);
      }
      if (event.event && event.published) assert.ok(event.event <= event.published);
    }
  }
});

test('retrospective and planned reports do not invent publication or completion dates', () => {
  const byId = (id) => archive.projects.find((p) => p.id === id);
  const stopped = byId('chennai-port-maduravoyal').events[0];
  assert.equal(stopped.event, '2012-03-29');
  assert.equal(stopped.published, '2015-03-09');
  const planned = byId('thiruvarur-bypass').events.at(-1);
  assert.equal(planned.event, null);
  const photo = byId('chennai-metro-phase-two').events.at(-1);
  assert.equal(photo.published, null);
});
