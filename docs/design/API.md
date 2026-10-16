# API 설계 규약

- 신규 API 기준 경로: `/api/v1`
- 기존 `/api/tasks`, `/api/projects/...`는 UI 전환 기간 동안 호환 유지
- 요청·응답: UTF-8 JSON, 파일은 multipart/form-data

## 1. 응답 형식

단건:

```json
{
  "data": {
    "id": 1,
    "name": "차세대 PMS",
    "version": 3
  }
}
```

목록:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 50,
    "total": 0
  }
}
```

오류:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해 주세요.",
    "details": [
      { "field": "endDate", "message": "종료일은 시작일보다 빠를 수 없습니다." }
    ],
    "requestId": "req_..."
  }
}
```

## 2. HTTP 규칙

| 상황 | 상태코드 |
|---|---:|
| 조회·수정 성공 | 200 |
| 생성 성공 | 201 |
| 비동기 작업 접수 | 202 |
| 삭제/보관 성공, 본문 없음 | 204 |
| 입력 오류 | 400 |
| 인증 필요 | 401 |
| 권한 없음 | 403 |
| 대상 없음 | 404 |
| 중복·상태 전이·version 충돌 | 409 |
| 파일 형식/크기 오류 | 413 또는 415 |
| 처리 가능한 입력이나 업무 규칙 위반 | 422 |
| 예상하지 못한 서버 오류 | 500 |
| 외부 시스템 또는 DB 일시 장애 | 503 |

## 3. 목록 규칙

- `page`, `pageSize`: 기본 1, 50; 최대 200
- `sort`: 허용 목록의 필드만 사용, 예: `sort=startDate,-priority`
- `filter[field]`: 모듈별 허용 필드만 사용
- `q`: 코드·명칭에 대한 단순 검색
- `includeArchived=true`: 권한이 있는 사용자만 보관 데이터 포함

SQL 컬럼이나 정렬 문자열을 그대로 연결하지 않고 서버의 필드 매핑표를 사용한다.

## 4. 동시 수정

수정·보관 요청은 현재 `version`을 `If-Match` 헤더 또는 본문에 전달한다.

```http
PATCH /api/v1/tasks/task-1
If-Match: "4"
```

현재 DB version과 다르면 `409 VERSION_CONFLICT`와 최신 데이터를 반환한다. 성공한
수정은 version을 1 증가시킨다.

## 5. 상태 전이 API

감사와 승인 규칙이 있는 상태는 일반 PATCH 대신 명령 엔드포인트를 사용한다.

```text
POST /api/v1/deliverable-versions/:id/submit
POST /api/v1/deliverable-versions/:id/approve
POST /api/v1/deliverable-versions/:id/reject
POST /api/v1/defects/:id/assign
POST /api/v1/defects/:id/resolve
POST /api/v1/defects/:id/verify
POST /api/v1/defects/:id/reopen
```

명령 본문에는 의견, version, 필요한 추가 필드를 전달한다.

## 6. 프로젝트와 조직

```text
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/:projectId
PATCH  /api/v1/projects/:projectId
DELETE /api/v1/projects/:projectId                 # 보관

GET    /api/v1/projects/:projectId/phases
POST   /api/v1/projects/:projectId/phases
PATCH  /api/v1/project-phases/:phaseId

GET    /api/v1/projects/:projectId/members
POST   /api/v1/projects/:projectId/members
PATCH  /api/v1/project-members/:memberId
DELETE /api/v1/project-members/:memberId

GET    /api/v1/organizations/tree
GET    /api/v1/users
```

## 7. WBS와 진척

```text
GET    /api/v1/projects/:projectId/tasks
POST   /api/v1/projects/:projectId/tasks
GET    /api/v1/tasks/:taskId
PATCH  /api/v1/tasks/:taskId
DELETE /api/v1/tasks/:taskId                       # 보관
POST   /api/v1/tasks/:taskId/move                  # 부모·순서 변경

GET    /api/v1/projects/:projectId/task-dependencies
POST   /api/v1/tasks/:taskId/predecessors
DELETE /api/v1/tasks/:taskId/predecessors/:predecessorId

POST   /api/v1/projects/:projectId/baselines
GET    /api/v1/projects/:projectId/baselines/:baselineId
POST   /api/v1/projects/:projectId/progress-snapshots
```

`move`는 새 부모, 형제 내 위치, version을 받고 순환 계층 여부를 한 트랜잭션에서
검증한다.

## 8. Excel 가져오기

```text
GET  /api/v1/import-templates/:importType
POST /api/v1/projects/:projectId/imports
GET  /api/v1/imports/:importId
PUT  /api/v1/imports/:importId/mapping
POST /api/v1/imports/:importId/validate
GET  /api/v1/imports/:importId/rows
GET  /api/v1/imports/:importId/errors.xlsx
POST /api/v1/imports/:importId/apply
POST /api/v1/imports/:importId/cancel
```

업로드는 `202`와 job ID를 반환한다. `apply`는 검증 성공 상태와 미리보기 대상의
version이 유지된 경우만 허용한다.

## 9. 산출물과 프로그램

```text
GET    /api/v1/standard-deliverables
POST   /api/v1/standard-deliverables
GET    /api/v1/projects/:projectId/deliverables
POST   /api/v1/projects/:projectId/deliverables
PATCH  /api/v1/project-deliverables/:deliverableId
POST   /api/v1/project-deliverables/:deliverableId/versions

GET    /api/v1/projects/:projectId/programs
POST   /api/v1/projects/:projectId/programs
PATCH  /api/v1/programs/:programId
DELETE /api/v1/programs/:programId
```

## 10. 테스트와 결함

```text
GET    /api/v1/projects/:projectId/test-plans
POST   /api/v1/projects/:projectId/test-plans
POST   /api/v1/test-plans/:planId/suites
POST   /api/v1/test-suites/:suiteId/cases
PATCH  /api/v1/test-cases/:caseId
POST   /api/v1/test-plans/:planId/runs
POST   /api/v1/test-runs/:runId/executions
PATCH  /api/v1/test-executions/:executionId/result

GET    /api/v1/projects/:projectId/defects
POST   /api/v1/projects/:projectId/defects
PATCH  /api/v1/defects/:defectId
```

실행 생성 시 테스트 케이스와 단계의 snapshot을 저장한다.

## 11. 이행과 SVN

```text
GET    /api/v1/projects/:projectId/deployment-scenarios
POST   /api/v1/projects/:projectId/deployment-scenarios
POST   /api/v1/deployment-scenarios/:scenarioId/versions
POST   /api/v1/deployment-versions/:versionId/runs
PATCH  /api/v1/deployment-runs/:runId/steps/:stepId/result

GET    /api/v1/projects/:projectId/svn-repositories
POST   /api/v1/projects/:projectId/svn-repositories
POST   /api/v1/svn-repositories/:repositoryId/sync
GET    /api/v1/svn-repositories/:repositoryId/revisions
POST   /api/v1/svn-revisions/:revisionId/links
```

SVN sync는 `202`를 반환하고 실제 작업은 Worker가 수행한다.

## 12. 첨부파일

```text
POST   /api/v1/projects/:projectId/attachments
GET    /api/v1/attachments/:attachmentId
GET    /api/v1/attachments/:attachmentId/content
GET    /api/v1/attachments/:attachmentId/preview
POST   /api/v1/attachments/:attachmentId/links
DELETE /api/v1/attachment-links/:linkId
```

업로드 완료 전에는 업무 객체와 연결하지 않는다. 바이러스 검사 상태가 안전으로
확정되지 않은 파일은 일반 다운로드를 차단한다.

## 13. 감사와 작업 상태

```text
GET /api/v1/projects/:projectId/audit-logs
GET /api/v1/entities/:entityType/:entityId/audit-logs
GET /api/v1/jobs/:jobId
GET /api/v1/jobs/:jobId/errors
```

감사 API는 관리자와 해당 프로젝트 권한이 있는 사용자에게만 제공하며 before/after
민감 필드는 마스킹한다.

## 14. API 구현 우선순위

1. 공통 오류·응답·pagination·requestId
2. 인증과 프로젝트 권한 middleware
3. 프로젝트·단계·구성원
4. WBS CRUD·move·version
5. 의존관계와 기준선
6. Excel import job
7. 첨부파일
8. 이후 모듈 API
