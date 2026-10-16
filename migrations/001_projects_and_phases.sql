-- 기존 pms_tasks 데이터를 유지하면서 프로젝트와 단계 기반을 추가한다.
-- MariaDB/MySQL DDL은 자동 커밋될 수 있으므로 운영 적용 전 백업이 필요하다.

USE pms_db;

CREATE TABLE IF NOT EXISTS pms_projects (
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_pms_projects_dates
        CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
    CONSTRAINT chk_pms_projects_status
        CHECK (status IN ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'))
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

-- 실제 작업에 이미 사용 중인 project_id를 프로젝트 마스터에 먼저 보존한다.
INSERT IGNORE INTO pms_projects (id, name, start_date, end_date, status)
SELECT
    project_id,
    CONCAT('프로젝트 ', project_id),
    MIN(start_date),
    MAX(end_date),
    'ACTIVE'
FROM pms_tasks
GROUP BY project_id;

CREATE TABLE IF NOT EXISTS pms_project_phases (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    project_id INT NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    sequence_no INT UNSIGNED NOT NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pms_project_phases_code (project_id, code),
    UNIQUE KEY uq_pms_project_phases_sequence (project_id, sequence_no),
    KEY idx_pms_project_phases_dates (project_id, start_date, end_date),
    CONSTRAINT fk_pms_project_phases_project
        FOREIGN KEY (project_id) REFERENCES pms_projects (id),
    CONSTRAINT chk_pms_project_phases_dates
        CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
    CONSTRAINT chk_pms_project_phases_status
        CHECK (status IN ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'))
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

-- 검증용 결과: 기존 작업 수는 마이그레이션 전후 동일해야 한다.
SELECT COUNT(*) AS task_count FROM pms_tasks;
SELECT id, name, start_date, end_date, status FROM pms_projects ORDER BY id;
SELECT id, project_id, code, name, sequence_no FROM pms_project_phases
ORDER BY project_id, sequence_no;
