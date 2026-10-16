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

const writeDbConfig = {
    ...dbConfig,
    user: process.env.DB_WRITE_USER || dbConfig.user,
    password: process.env.DB_WRITE_PASSWORD || dbConfig.password
};

const PROJECT_STATUSES = new Set([
    'PLANNED',
    'ACTIVE',
    'ON_HOLD',
    'COMPLETED',
    'CANCELLED'
]);

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

function normalizeNullableDate(value) {
    if (value === undefined || value === null || value === '') return null;
    return normalizeDate(value) || null;
}

function normalizeInputDate(value) {
    if (value === undefined || value === null || value === '') return null;
    const text = String(value);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1000) return null;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day ? text : null;
}

function normalizeProject(project) {
    return {
        id: Number(project.id),
        name: String(project.name),
        description: project.description ? String(project.description) : '',
        startDate: normalizeNullableDate(project.start_date),
        endDate: normalizeNullableDate(project.end_date),
        status: String(project.status),
        createdAt: project.created_at ? String(project.created_at) : null,
        updatedAt: project.updated_at ? String(project.updated_at) : null
    };
}

function normalizePhase(phase) {
    return {
        id: Number(phase.id),
        projectId: Number(phase.project_id),
        code: String(phase.code),
        name: String(phase.name),
        sequence: Number(phase.sequence_no),
        startDate: normalizeNullableDate(phase.start_date),
        endDate: normalizeNullableDate(phase.end_date),
        status: String(phase.status)
    };
}

function validateDateRange(startDate, endDate) {
    if (startDate && endDate && endDate < startDate) {
        return '종료일은 시작일보다 빠를 수 없습니다.';
    }
    return null;
}

function validateProjectInput(body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const startDate = normalizeInputDate(body.startDate);
    const endDate = normalizeInputDate(body.endDate);
    const status = body.status === undefined ? 'PLANNED' : String(body.status);

    if (!name || name.length > 255) {
        return { error: '프로젝트명은 1자 이상 255자 이하여야 합니다.' };
    }
    if (body.startDate && !startDate) return { error: '시작일 형식이 올바르지 않습니다.' };
    if (body.endDate && !endDate) return { error: '종료일 형식이 올바르지 않습니다.' };
    const dateError = validateDateRange(startDate, endDate);
    if (dateError) return { error: dateError };
    if (!PROJECT_STATUSES.has(status)) return { error: '프로젝트 상태가 올바르지 않습니다.' };

    return {
        value: {
            name,
            description: typeof body.description === 'string' ? body.description.trim() : null,
            startDate,
            endDate,
            status
        }
    };
}

function validatePhaseInput(body) {
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const sequence = Number(body.sequence);
    const startDate = normalizeInputDate(body.startDate);
    const endDate = normalizeInputDate(body.endDate);
    const status = body.status === undefined ? 'PLANNED' : String(body.status);

    if (!code || code.length > 50) return { error: '단계 코드는 1자 이상 50자 이하여야 합니다.' };
    if (!name || name.length > 255) return { error: '단계명은 1자 이상 255자 이하여야 합니다.' };
    if (!Number.isSafeInteger(sequence) || sequence < 1) return { error: '단계 순서는 1 이상의 정수여야 합니다.' };
    if (body.startDate && !startDate) return { error: '시작일 형식이 올바르지 않습니다.' };
    if (body.endDate && !endDate) return { error: '종료일 형식이 올바르지 않습니다.' };
    const dateError = validateDateRange(startDate, endDate);
    if (dateError) return { error: dateError };
    if (!PROJECT_STATUSES.has(status)) return { error: '단계 상태가 올바르지 않습니다.' };

    return { value: { code, name, sequence, startDate, endDate, status } };
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

function createApp(pool, writePool = pool) {
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

    app.get('/api/projects', async (_req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT id, name, description, start_date, end_date, status, created_at, updated_at
                 FROM pms_projects ORDER BY id`
            );
            res.json(rows.map(normalizeProject));
        } catch (error) {
            console.error('프로젝트 목록 조회 실패:', error.message);
            res.status(503).json({ error: '데이터베이스에서 프로젝트 목록을 불러오지 못했습니다.' });
        }
    });

    app.post('/api/projects', async (req, res) => {
        const validated = validateProjectInput(req.body || {});
        if (validated.error) {
            res.status(400).json({ error: validated.error });
            return;
        }

        const project = validated.value;
        try {
            const [result] = await writePool.query(
                `INSERT INTO pms_projects (name, description, start_date, end_date, status)
                 VALUES (?, ?, ?, ?, ?)`,
                [project.name, project.description, project.startDate, project.endDate, project.status]
            );
            res.status(201).json({ id: Number(result.insertId), ...project });
        } catch (error) {
            console.error('프로젝트 등록 실패:', error.message);
            res.status(503).json({ error: '프로젝트를 등록하지 못했습니다.' });
        }
    });

    app.get('/api/projects/:projectId/phases', async (req, res) => {
        const projectId = parseProjectId(req.params.projectId);
        if (projectId === null) {
            res.status(400).json({ error: '프로젝트 ID는 양의 정수여야 합니다.' });
            return;
        }

        try {
            const [rows] = await pool.query(
                `SELECT id, project_id, code, name, sequence_no, start_date, end_date, status
                 FROM pms_project_phases WHERE project_id = ? ORDER BY sequence_no, id`,
                [projectId]
            );
            res.json(rows.map(normalizePhase));
        } catch (error) {
            console.error('프로젝트 단계 조회 실패:', error.message);
            res.status(503).json({ error: '데이터베이스에서 프로젝트 단계를 불러오지 못했습니다.' });
        }
    });

    app.post('/api/projects/:projectId/phases', async (req, res) => {
        const projectId = parseProjectId(req.params.projectId);
        if (projectId === null) {
            res.status(400).json({ error: '프로젝트 ID는 양의 정수여야 합니다.' });
            return;
        }
        const validated = validatePhaseInput(req.body || {});
        if (validated.error) {
            res.status(400).json({ error: validated.error });
            return;
        }

        const phase = validated.value;
        try {
            const [result] = await writePool.query(
                `INSERT INTO pms_project_phases
                    (project_id, code, name, sequence_no, start_date, end_date, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [projectId, phase.code, phase.name, phase.sequence, phase.startDate, phase.endDate, phase.status]
            );
            res.status(201).json({ id: Number(result.insertId), projectId, ...phase });
        } catch (error) {
            console.error('프로젝트 단계 등록 실패:', error.message);
            const status = error.code === 'ER_DUP_ENTRY' ? 409 : 503;
            res.status(status).json({ error: status === 409 ? '동일한 단계 코드 또는 순서가 이미 존재합니다.' : '프로젝트 단계를 등록하지 못했습니다.' });
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
const writePool = process.env.DB_WRITE_USER ? mysql.createPool(writeDbConfig) : pool;
const app = createApp(pool, writePool);

if (require.main === module) {
    const server = app.listen(PORT, '127.0.0.1', () => {
        console.log(`PMS 서버: http://localhost:${PORT}`);
        console.log(`MySQL: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    });

    async function shutdown(signal) {
        console.log(`\n${signal} 수신: 서버를 종료합니다.`);
        server.close(async () => {
            await pool.end();
            if (writePool !== pool) await writePool.end();
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
    normalizeProject,
    normalizePhase,
    validateProjectInput,
    validatePhaseInput,
    normalizeDate,
    normalizeProgress,
    normalizeTask
};
