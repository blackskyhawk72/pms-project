const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildTaskHierarchy,
    parseProjectId,
    normalizeDate,
    normalizeProgress,
    normalizeTask
} = require('../server');

test('날짜는 YYYY-MM-DD 형식으로 정규화한다', () => {
    assert.equal(normalizeDate('2026-10-16 12:30:00'), '2026-10-16');
    assert.equal(normalizeDate('잘못된 날짜'), '');
    assert.equal(normalizeDate(null), '');
});

test('진척률은 0에서 100 사이로 제한한다', () => {
    assert.equal(normalizeProgress(-10), 0);
    assert.equal(normalizeProgress(45), 45);
    assert.equal(normalizeProgress(120), 100);
    assert.equal(normalizeProgress('invalid'), 0);
});

test('DB 작업을 간트 작업 형식으로 변환한다', () => {
    assert.deepEqual(
        normalizeTask({
            id: 7,
            project_id: 1,
            title: '설계',
            parent_id: null,
            start_date: '2026-10-16',
            end_date: '2026-10-18',
            progress: 30,
            dependencies: null,
            assignee: '홍길동'
        }),
        {
            id: '7',
            projectId: 1,
            name: '설계',
            parentId: null,
            start: '2026-10-16',
            end: '2026-10-18',
            progress: 30,
            dependencies: '',
            assignee: '홍길동'
        }
    );
});

test('부모 작업 다음에 자식 작업을 WBS 깊이와 함께 배치한다', () => {
    const rows = [
        { id: 'child', project_id: 1, title: '구현', parent_id: 'parent', start_date: '2026-10-17', end_date: '2026-10-18' },
        { id: 'parent', project_id: 1, title: '개발', parent_id: null, start_date: '2026-10-16', end_date: '2026-10-20' },
        { id: 'orphan', project_id: 1, title: '고아 작업', parent_id: 'missing', start_date: '2026-10-19', end_date: '2026-10-20' }
    ];

    const tasks = buildTaskHierarchy(rows);

    assert.deepEqual(tasks.map(({ id, depth, wbs }) => ({ id, depth, wbs })), [
        { id: 'parent', depth: 0, wbs: '1' },
        { id: 'child', depth: 1, wbs: '1.1' },
        { id: 'orphan', depth: 0, wbs: '2' }
    ]);
});

test('프로젝트 ID는 양의 정수만 허용한다', () => {
    assert.equal(parseProjectId('1'), 1);
    assert.equal(parseProjectId('0'), null);
    assert.equal(parseProjectId('1 OR 1=1'), null);
});
