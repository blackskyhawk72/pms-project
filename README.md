# PMS Project

MySQL의 `pms_tasks` 테이블을 읽어 Frappe Gantt 기반 워터폴 일정을 표시하는 Node.js 애플리케이션입니다.

## 준비

1. XAMPP MySQL을 3307 포트로 실행합니다.
2. phpMyAdmin 또는 MySQL CLI에서 `schema.sql`을 실행합니다. 처음 설치할 때는 파일 하단의 계정 생성 3줄에서 비밀번호를 바꾸고 주석을 해제해 함께 실행합니다.
3. `.env.example`을 `.env`로 복사하고 DB 계정과 비밀번호를 입력합니다. 서버는 시작할 때 `.env`를 자동으로 읽습니다.

PowerShell 예시:

```powershell
Copy-Item .env.example .env
# .env 파일의 DB_PASSWORD를 실제 비밀번호로 변경합니다.
npm start
```

브라우저에서 <http://localhost:3000>을 엽니다.

## 명령

```powershell
npm install
npm start
npm test
```

상태 확인 API는 `GET /api/health`, 전체 작업 목록 API는 `GET /api/tasks`입니다.
프로젝트별 작업은 `GET /api/projects/:projectId/tasks`로 조회합니다. 예를 들어
프로젝트 1의 화면은 <http://localhost:3000/?project_id=1>에서 확인할 수 있습니다.

프로젝트 목록은 `GET /api/projects`, 프로젝트 등록은 `POST /api/projects`,
단계 목록과 등록은 각각 `GET/POST /api/projects/:projectId/phases`를 사용합니다.
쓰기 API는 `.env`의 `DB_WRITE_USER`, `DB_WRITE_PASSWORD` 계정을 사용합니다.

기존 `pms_tasks`만 있는 데이터베이스는 관리자 계정으로 백업한 뒤
`migrations/001_projects_and_phases.sql`을 검토하여 실행합니다. 애플리케이션은
마이그레이션을 자동 실행하지 않습니다.

작업 API는 부모 작업이 자식보다 먼저 오도록 평탄화한 배열을 반환합니다.
각 작업에는 원본 `parentId`와 함께 화면용 `depth`, `wbs` 값이 포함됩니다.

제품 요구사항은 `REQUIREMENTS.md`, 범용 PMS 비교 결과는 `BENCHMARK.md`,
단계별 구현 계획은 `DEVELOPMENT_PLAN.md`에서 확인할 수 있습니다.
시스템 구조, 데이터 모델, API 규약은 `docs/design/`에 정리되어 있습니다.
