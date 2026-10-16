require('dotenv').config({ quiet: true });

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const PORT = parseInteger(process.env.PORT, 3000);
const DB_PORT = parseInteger(process.env.DB_PORT, 3307);

const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: DB_PORT,
    user: process.env.DB_USER || 'pms_app',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pms_db',
    waitForConnections: true,
    connectionLimit: parseInteger(process.env.DB_CONNECTION_LIMIT, 10),
    queueLimit: 0,
    dateStrings: true
};

function parseInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDate(value) {
    if (!value) return '';
    const text = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeProgress(value) {
    const progress = Number(value);
    if (!Number.isFinite(progress)) return 0;
    return Math.min(100, Math.max(0, progress));
}

function normalizeTask(task) {
    return {
        id: String(task.id),
        projectId: Number(task.project_id),
        name: String(task.title || '이름 없음'),
        parentId: task.parent_id ? String(task.parent_id) : null,
        start: normalizeDate(task.start_date),
        end: normalizeDate(task.end_date),
        progress: normalizeProgress(task.progress),
        dependencies: task.dependencies ? String(task.dependencies).trim() : '',
        assignee: task.assignee ? String(task.assignee) : ''
    };
}

function compareTasks(left, right) {
    return left.start.localeCompare(right.start) || left.id.localeCompare(right.id);
}

function buildTaskHierarchy(rows) {
    const tasks = rows
        .map(normalizeTask)
        .filter((task) => task.start && task.end)
        .sort(compareTasks);
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const childrenByParent = new Map();
    const roots = [];

    for (const task of tasks) {
        if (!task.parentId || task.parentId === task.id || !tasksById.has(task.parentId)) {
            roots.push(task);
            continue;
        }

        const children = childrenByParent.get(task.parentId) || [];
        children.push(task);
        childrenByParent.set(task.parentId, children);
    }

    for (const children of childrenByParent.values()) {
        children.sort(compareTasks);
    }

    const result = [];
    const emitted = new Set();

    function visit(task, depth, wbs) {
        if (emitted.has(task.id)) return;
        emitted.add(task.id);
        result.push({ ...task, depth, wbs });

        const children = childrenByParent.get(task.id) || [];
        children.forEach((child, index) => visit(child, depth + 1, `${wbs}.${index + 1}`));
    }

    let rootNumber = 0;
    for (const root of roots) {
        rootNumber += 1;
        visit(root, 0, String(rootNumber));
    }

    // 순환 참조만으로 구성된 그룹도 누락하지 않고 최상위 항목처럼 표시한다.
    for (const task of tasks) {
        if (!emitted.has(task.id)) {
            rootNumber += 1;
            visit(task, 0, String(rootNumber));
        }
    }

    return result;
}

function parseProjectId(value) {
    if (!/^[1-9]\d*$/.test(String(value))) return null;
    const projectId = Number(value);
    return Number.isSafeInteger(projectId) ? projectId : null;
}

const TASK_COLUMNS = [
    'id',
    'project_id',
    'title',
    'parent_id',
    'start_date',
    'end_date',
    'progress',
    'dependencies',
    'assignee'
].join(', ');

async function loadTasks(pool, projectId) {
    const where = projectId === undefined ? '' : ' WHERE project_id = ?';
    const parameters = projectId === undefined ? [] : [projectId];
    const [rows] = await pool.query(
        `SELECT ${TASK_COLUMNS} FROM pms_tasks${where} ORDER BY start_date, id`,
        parameters
    );
    return buildTaskHierarchy(rows);
}

function createApp(pool) {
    const app = express();

    app.disable('x-powered-by');
    app.use(express.json({ limit: '100kb' }));
    app.use(
        '/vendor/frappe-gantt',
        express.static(path.join(__dirname, 'node_modules', 'frappe-gantt', 'dist'), {
            fallthrough: false,
            immutable: true,
            maxAge: '1d'
        })
    );

    app.get('/api/tasks', async (_req, res) => {
        try {
            res.json(await loadTasks(pool));
        } catch (error) {
            console.error('작업 목록 조회 실패:', error.message);
            res.status(503).json({
                error: '데이터베이스에서 작업 목록을 불러오지 못했습니다.'
            });
        }
    });

    app.get('/api/projects/:projectId/tasks', async (req, res) => {
        const projectId = parseProjectId(req.params.projectId);
        if (projectId === null) {
            res.status(400).json({ error: '프로젝트 ID는 양의 정수여야 합니다.' });
            return;
        }

        try {
            res.json(await loadTasks(pool, projectId));
        } catch (error) {
            console.error('프로젝트 작업 목록 조회 실패:', error.message);
            res.status(503).json({
                error: '데이터베이스에서 작업 목록을 불러오지 못했습니다.'
            });
        }
    });

    app.get('/api/health', async (_req, res) => {
        try {
            await pool.query('SELECT 1');
            res.json({ status: 'ok', database: 'connected' });
        } catch (_error) {
            res.status(503).json({ status: 'error', database: 'disconnected' });
        }
    });

    app.get('/', (_req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });

    return app;
}

const pool = mysql.createPool(dbConfig);
const app = createApp(pool);

if (require.main === module) {
    const server = app.listen(PORT, '127.0.0.1', () => {
        console.log(`PMS 서버: http://localhost:${PORT}`);
        console.log(`MySQL: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    });

    async function shutdown(signal) {
        console.log(`\n${signal} 수신: 서버를 종료합니다.`);
        server.close(async () => {
            await pool.end();
            process.exit(0);
        });
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = {
    app,
    createApp,
    buildTaskHierarchy,
    parseProjectId,
    normalizeDate,
    normalizeProgress,
    normalizeTask
};
