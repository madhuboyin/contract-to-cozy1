const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Uploading a file is not itself a property event. A Timeline moment comes from a reviewed fact (Home Records extraction and promotion), never
// from the act of uploading, so no writer may create an "Uploaded document" event. This pins the two legacy writers that used to.
const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('the legacy upload paths do not create a Timeline event', () => {
  for (const file of ['src/routes/document.routes.ts', 'src/services/home-management.service.ts']) {
    const source = read(file);
    assert.doesNotMatch(source, /onDocumentUploaded/, `${file} must not create an upload-driven Timeline event`);
  }
  assert.doesNotMatch(read('src/routes/document.routes.ts'), /HomeEventsAutoGen/, 'the documents route no longer needs the Timeline auto-generator');
});

test('the Timeline auto-generator no longer offers an upload hook, and no source produces the "Uploaded document" event title', () => {
  const autogen = read('src/services/homeEvents/homeEvents.autogen.ts');
  assert.doesNotMatch(autogen, /onDocumentUploaded/);
  assert.doesNotMatch(autogen, /Uploaded document:/);
});
