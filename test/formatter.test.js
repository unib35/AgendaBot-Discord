// Node.js built-in test runner (no extra deps)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    formatAgendaTitle,
    replaceCheckboxes,
    toggleCheckbox,
    parseChecklistItems,
    sanitizeMarkdown,
} from '../src/utils/formatter.js';

test('formatAgendaTitle trims to 100 chars', () => {
    const long = 'x'.repeat(150);
    const title = formatAgendaTitle(1, long, '진행중');
    assert.ok(title.length <= 100);
    assert.match(title, /^\[🧭 진행중\] 1 /);
});

test('replaceCheckboxes converts all empty boxes to checked', () => {
    const input = 'Todo\n- ⬜ item1\n- ⬜ item2';
    const out = replaceCheckboxes(input);
    assert.equal(out.includes('☑️'), true);
    assert.equal(out.match(/☑️/g).length, 2);
});

test('toggleCheckbox toggles nth checkbox', () => {
    const input = '- ⬜ a\n- ⬜ b\n- ☑️ c';
    const res = toggleCheckbox(input, 2); // toggle second item
    assert.equal(res.success, true);
    assert.equal(res.checked, true);
    assert.match(res.content.split('\n')[1], /☑️/);
});

test('parseChecklistItems extracts items with state', () => {
    const input = '- ⬜ a\n- ☑️ b\nplain text';
    const items = parseChecklistItems(input);
    assert.equal(items.length, 2);
    assert.deepEqual(items.map(i => i.checked), [false, true]);
});

test('sanitizeMarkdown escapes special characters', () => {
    const raw = '*a_b~`>|';
    const safe = sanitizeMarkdown(raw);
    assert.notEqual(raw, safe);
    assert.match(safe, /\*/); // escaped star
});

