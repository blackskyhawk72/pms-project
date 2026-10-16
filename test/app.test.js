const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { createApp } = require('../server');

async function withServer(pool, callback) {
    const server = createApp(pool).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address();

    try {
        await callback(`http://127.0.0.1:${port}`);
    } finally {
        server.close();
        await once(server, 'close');
    }
}

test('메인 화면과 Frappe Gantt 자산을 제공한다', async () => {
    await withServer({ query: async () => [[{ 1: 1 }]] }, async (baseUrl) => {
        const page = await fetch(`${baseUrl}/`);
        const html = await page.text();
        const css = await fetch(
            `${baseUrl}/vendor/frappe-gantt/frappe-gantt.css`
        );

        assert.equal(page.status, 200);
        assert.match(html, /IT 개발 워터폴 PMS/);
        assert.equal(css.status, 200);
        assert.match(css.headers.get('content-type'), /text\/css/);
    });
});

test('작업 API는 정규화한 JSON을 반환한다', async () => {
    const pool = {
        query: async () => [[{
            id: 1,
            project_id: 1,
            title: '</script><script>alert(1)</script>',
            parent_id: null,
            start_date: '2026-10-16',
            end_date: '2026-10-20',
            progress: 150,
            dependencies: null,
            assignee: null
        }]]
    };

    await withServer(pool, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/tasks`);
        const tasks = await response.json();

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type').startsWith('application/json'), true);
        assert.equal(tasks[0].name, '</script><script>alert(1)</script>');
        assert.equal(tasks[0].progress, 100);
        assert.equal(tasks[0].depth, 0);
        assert.equal(tasks[0].wbs, '1');
    });
});

test('프로젝트별 작업 API는 바인딩 파라미터로 조회한다', async () => {
    let queryCall;
    const pool = {
        query: async (...args) => {
            queryCall = args;
            return [[]];
        }
    };

    await withServer(pool, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/projects/17/tasks`);

        assert.equal(response.status, 200);
        assert.match(queryCall[0], /WHERE project_id = \?/);
        assert.deepEqual(queryCall[1], [17]);
    });
});

test('잘못된 프로젝트 ID는 DB를 조회하지 않고 거절한다', async () => {
    const pool = { query: async () => { throw new Error('호출되면 안 됨'); } };

    await withServer(pool, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/projects/not-a-number/tasks`);
        const payload = await response.json();

        assert.equal(response.status, 400);
        assert.equal(payload.error, '프로젝트 ID는 양의 정수여야 합니다.');
    });
});

test('DB 오류는 상세정보 없이 503으로 응답한다', async () => {
    const pool = { query: async () => { throw new Error('secret DB error'); } };

    await withServer(pool, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/tasks`);
        const payload = await response.json();

        assert.equal(response.status, 503);
        assert.equal(payload.error, '데이터베이스에서 작업 목록을 불러오지 못했습니다.');
        assert.equal(JSON.stringify(payload).includes('secret DB error'), false);
    });
});
