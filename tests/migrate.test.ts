import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statements } from '../src/lib/server/migrate.ts';
test('migration splitter ignores comments and splits on line-ending semicolons', () => {
    const sql = '-- comment; with semicolon\nCREATE TABLE a (x INT);\nALTER TABLE a ADD COLUMN y VARCHAR(10) DEFAULT \'a;b\';\n\nUPDATE a SET x=1;';
    assert.deepEqual(statements(sql), ['CREATE TABLE a (x INT)', "ALTER TABLE a ADD COLUMN y VARCHAR(10) DEFAULT 'a;b'", 'UPDATE a SET x=1']);
    assert.deepEqual(statements('-- only comment\n'), []);
});
