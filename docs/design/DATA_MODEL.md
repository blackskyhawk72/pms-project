# 데이터 모델 설계

- 상태: 논리 모델 초안 v0.1
- 물리 명명 규칙: 테이블 `pms_` 접두어, snake_case, 날짜는 `DATE`, 시각은 `DATETIME`
- 모든 업무 테이블은 `created_at`, `created_by`, `updated_at`, `updated_by`, `version`을 기본으로 한다.
- 보관 가능한 테이블은 `archived_at`, `archived_by`를 사용한다.

## 1. 핵심 프로젝트와 조직

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ ORGANIZATIONS : parent
    ORGANIZATIONS ||--o{ USERS : contains
    USERS ||--o{ PROJECT_MEMBERS : joins
    PROJECTS ||--o{ PROJECT_MEMBERS : has
    PROJECTS ||--o{ PROJECT_PHASES : has
    PROJECT_TEMPLATES ||--o{ TEMPLATE_PHASES : defines
    PROJECT_TEMPLATES ||--o{ PROJECTS : creates

    ORGANIZATIONS {
      bigint id PK
      bigint parent_id FK
      varchar code UK
      varchar name
    }
    USERS {
      bigint id PK
      bigint organization_id FK
      varchar login_id UK
      varchar display_name
      varchar status
    }
    PROJECTS {
      int id PK
      varchar code UK
      varchar name
      date start_date
      date end_date
      varchar status
      bigint manager_id FK
      int version
    }
    PROJECT_MEMBERS {
      bigint id PK
      int project_id FK
      bigint user_id FK
      varchar role_code
      date joined_on
      date left_on
    }
    PROJECT_PHASES {
      bigint id PK
      int project_id FK
      varchar code
      varchar name
      int sequence_no
      date start_date
      date end_date
      varchar status
    }
```

프로젝트 역할은 초기에는 시스템 정의 코드로 시작하고, 권한 요구가 확정되면
`pms_roles`, `pms_permissions`, `pms_role_permissions`로 분리한다.

## 2. WBS와 진척

```mermaid
erDiagram
    PROJECTS ||--o{ TASKS : owns
    PROJECT_PHASES ||--o{ TASKS : groups
    TASKS ||--o{ TASKS : parent
    TASKS ||--o{ TASK_DEPENDENCIES : successor
    TASKS ||--o{ TASK_DEPENDENCIES : predecessor
    PROJECTS ||--o{ BASELINES : snapshots
    BASELINES ||--o{ BASELINE_TASKS : contains
    TASKS ||--o{ BASELINE_TASKS : captures
    PROJECTS ||--o{ PROGRESS_SNAPSHOTS : tracks
    TASKS ||--o{ PROGRESS_SNAPSHOTS : tracks

    TASKS {
      varchar id PK
      int project_id FK
      bigint phase_id FK
      varchar parent_id FK
      varchar task_code
      varchar title
      varchar task_type
      varchar status
      date start_date
      date end_date
      date actual_start_date
      date actual_end_date
      decimal progress
      decimal weight
      bigint assignee_id FK
      int version
    }
    TASK_DEPENDENCIES {
      bigint id PK
      int project_id FK
      varchar task_id FK
      varchar predecessor_task_id FK
      varchar dependency_type
      int lag_days
    }
    BASELINES {
      bigint id PK
      int project_id FK
      int baseline_no
      varchar status
      datetime approved_at
    }
    BASELINE_TASKS {
      bigint baseline_id FK
      varchar task_id FK
      date start_date
      date end_date
      decimal progress
    }
    PROGRESS_SNAPSHOTS {
      bigint id PK
      int project_id FK
      varchar task_id FK
      date snapshot_date
      decimal planned_progress
      decimal actual_progress
    }
```

기존 `pms_tasks.id VARCHAR(50)`은 데이터 보존을 위해 유지한다. `dependencies` CSV는
연결 테이블로 이관한 뒤 검증 기간 동안 읽기 호환만 제공하고 최종 제거한다.

필수 유일키와 인덱스:

- `tasks(project_id, task_code)` unique
- `tasks(project_id, parent_id, start_date, id)`
- `task_dependencies(project_id, task_id, predecessor_task_id)` unique
- `progress_snapshots(project_id, snapshot_date, task_id)` unique
- `baseline_tasks(baseline_id, task_id)` unique

## 3. 산출물과 프로그램

```mermaid
erDiagram
    STANDARD_DELIVERABLES ||--o{ STANDARD_DELIVERABLE_VERSIONS : versions
    PROJECTS ||--o{ PROJECT_DELIVERABLES : requires
    STANDARD_DELIVERABLES ||--o{ PROJECT_DELIVERABLES : instantiates
    PROJECT_PHASES ||--o{ PROJECT_DELIVERABLES : schedules
    PROJECT_DELIVERABLES ||--o{ DELIVERABLE_VERSIONS : versions
    DELIVERABLE_VERSIONS ||--o{ DELIVERABLE_APPROVALS : reviews
    PROJECTS ||--o{ PROGRAMS : owns
    TASKS ||--o{ TRACE_LINKS : links
    PROGRAMS ||--o{ TRACE_LINKS : links
    PROJECT_DELIVERABLES ||--o{ TRACE_LINKS : links

    STANDARD_DELIVERABLES {
      bigint id PK
      varchar code UK
      varchar name
      varchar category
      boolean required_default
    }
    PROJECT_DELIVERABLES {
      bigint id PK
      int project_id FK
      bigint phase_id FK
      bigint standard_deliverable_id FK
      varchar code
      varchar name
      varchar status
      date due_date
      bigint owner_id FK
      int version
    }
    DELIVERABLE_VERSIONS {
      bigint id PK
      bigint project_deliverable_id FK
      int version_no
      varchar status
      bigint attachment_id FK
      datetime submitted_at
    }
    PROGRAMS {
      bigint id PK
      int project_id FK
      varchar program_code
      varchar name
      varchar program_type
      varchar business_area
      varchar status
      bigint assignee_id FK
      int version
    }
```

`TRACE_LINKS`는 여러 모듈의 연결을 조회하기 위한 보조 색인이다. 연결 생성 시 각
도메인 서비스가 대상 존재와 동일 프로젝트 여부를 검증한다. 핵심 소유 관계는 실제
외래키로 유지한다.

## 4. 테스트와 결함

```mermaid
erDiagram
    PROJECTS ||--o{ TEST_PLANS : owns
    TEST_PLANS ||--o{ TEST_SUITES : contains
    TEST_SUITES ||--o{ TEST_CASES : contains
    TEST_CASES ||--o{ TEST_STEPS : defines
    TEST_PLANS ||--o{ TEST_RUNS : executes
    TEST_RUNS ||--o{ TEST_EXECUTIONS : contains
    TEST_CASES ||--o{ TEST_EXECUTIONS : snapshots
    TEST_EXECUTIONS ||--o{ DEFECTS : discovers
    PROGRAMS ||--o{ TEST_CASE_LINKS : covered_by
    TEST_CASES ||--o{ TEST_CASE_LINKS : covers

    TEST_PLANS {
      bigint id PK
      int project_id FK
      varchar test_type
      varchar name
      varchar status
    }
    TEST_CASES {
      bigint id PK
      int project_id FK
      bigint suite_id FK
      varchar case_code
      varchar title
      varchar priority
      int version
    }
    TEST_STEPS {
      bigint id PK
      bigint test_case_id FK
      int sequence_no
      text action
      text expected_result
    }
    TEST_RUNS {
      bigint id PK
      bigint test_plan_id FK
      varchar cycle_name
      varchar build_version
      varchar environment
      varchar status
    }
    TEST_EXECUTIONS {
      bigint id PK
      bigint test_run_id FK
      bigint test_case_id FK
      int case_version
      json case_snapshot
      varchar result
      bigint tester_id FK
      datetime executed_at
    }
    DEFECTS {
      bigint id PK
      int project_id FK
      bigint test_execution_id FK
      varchar defect_code
      varchar title
      varchar severity
      varchar priority
      varchar status
      bigint assignee_id FK
      int version
    }
```

`case_snapshot`은 실행 당시 케이스와 단계의 재현용 사본이다. 검색과 리포트에 필요한
필드는 정규 컬럼으로 유지하고 JSON은 과거 정의 재현에만 사용한다.

## 5. 이행과 SVN

```mermaid
erDiagram
    PROJECTS ||--o{ DEPLOYMENT_SCENARIOS : owns
    DEPLOYMENT_SCENARIOS ||--o{ DEPLOYMENT_VERSIONS : versions
    DEPLOYMENT_VERSIONS ||--o{ DEPLOYMENT_STEPS : defines
    DEPLOYMENT_VERSIONS ||--o{ DEPLOYMENT_RUNS : executes
    DEPLOYMENT_RUNS ||--o{ DEPLOYMENT_STEP_RESULTS : records
    DEPLOYMENT_STEPS ||--o{ DEPLOYMENT_STEP_RESULTS : records
    PROJECTS ||--o{ SVN_REPOSITORIES : connects
    SVN_REPOSITORIES ||--o{ SVN_REVISIONS : contains
    SVN_REVISIONS ||--o{ SVN_CHANGED_PATHS : changes
    SVN_REVISIONS ||--o{ TRACE_LINKS : links

    DEPLOYMENT_SCENARIOS {
      bigint id PK
      int project_id FK
      varchar code
      varchar name
      varchar status
    }
    DEPLOYMENT_STEPS {
      bigint id PK
      bigint deployment_version_id FK
      int sequence_no
      varchar title
      text procedure_text
      text verification_text
      text rollback_text
      bigint assignee_id FK
    }
    DEPLOYMENT_STEP_RESULTS {
      bigint id PK
      bigint deployment_run_id FK
      bigint deployment_step_id FK
      varchar result
      datetime started_at
      datetime finished_at
    }
    SVN_REPOSITORIES {
      bigint id PK
      int project_id FK
      varchar repository_url
      bigint last_synced_revision
      varchar status
    }
    SVN_REVISIONS {
      bigint id PK
      bigint repository_id FK
      bigint revision_no
      varchar author
      datetime committed_at
      text message
    }
```

## 6. 첨부, 감사, Excel 작업

```mermaid
erDiagram
    ATTACHMENTS ||--o{ ATTACHMENT_LINKS : linked
    IMPORT_JOBS ||--o{ IMPORT_ROWS : contains
    JOBS ||--o{ JOB_ATTEMPTS : retries

    ATTACHMENTS {
      bigint id PK
      int project_id FK
      varchar storage_key UK
      varchar original_name
      varchar mime_type
      bigint size_bytes
      char sha256
      varchar scan_status
      bigint uploaded_by FK
    }
    ATTACHMENT_LINKS {
      bigint id PK
      bigint attachment_id FK
      varchar entity_type
      varchar entity_id
      varchar purpose
      int version_no
    }
    AUDIT_LOGS {
      bigint id PK
      int project_id
      varchar entity_type
      varchar entity_id
      varchar action
      json before_data
      json after_data
      bigint actor_id
      datetime created_at
    }
    IMPORT_JOBS {
      bigint id PK
      int project_id FK
      varchar import_type
      varchar status
      bigint attachment_id FK
      json column_mapping
      json summary
    }
    IMPORT_ROWS {
      bigint id PK
      bigint import_job_id FK
      int row_no
      json raw_data
      json normalized_data
      json errors
      varchar comparison_result
    }
    JOBS {
      bigint id PK
      varchar job_type
      varchar status
      json payload
      int attempt_count
      datetime available_at
      datetime heartbeat_at
      varchar lease_token UK
      datetime lease_expires_at
      text last_error
    }
    JOB_ATTEMPTS {
      bigint id PK
      bigint job_id FK
      int attempt_no
      datetime started_at
      datetime finished_at
      varchar result
      text error_message
    }
```

다형 연결 테이블의 `entity_type/entity_id`는 허용 목록과 서비스 검증을 적용한다.
첨부 다운로드 때 연결 대상의 프로젝트 권한을 반드시 다시 확인한다.

## 7. 상태 코드

상태 문자열은 DB ENUM보다 공통 코드 또는 CHECK 제약으로 관리한다. 배포 없이 상태를
추가해야 하는 도메인은 공통 코드 테이블을 사용하고, 보안 또는 업무 전이에 직접
영향을 주는 상태는 애플리케이션 상수와 마이그레이션으로 통제한다.

## 8. 데이터 마이그레이션 순서

1. 현재 스키마와 데이터 진단 및 백업
2. 프로젝트·단계 테이블 생성과 기존 `project_id` 프로젝트 생성
3. 사용자·조직·프로젝트 구성원 추가
4. `pms_tasks`에 상태·phase·version·audit 컬럼을 nullable로 추가
5. 기존 담당자 문자열을 사용자와 매핑하고 미매핑 값 보관
6. 의존관계 CSV를 staging에서 검증한 뒤 연결 테이블로 이관
7. 새 코드의 이중 읽기 검증
8. NOT NULL·외래키·CHECK·인덱스를 단계적으로 적용
9. 안정화 후 레거시 컬럼 읽기 제거

각 단계는 작업 수, 프로젝트별 합계, 날짜·진척 위반, 고아 부모, 의존관계 수를
적용 전후 비교한다.
