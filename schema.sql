CREATE DATABASE IF NOT EXISTS pms_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_general_ci;

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

CREATE TABLE IF NOT EXISTS pms_tasks (
    id VARCHAR(50) NOT NULL,
    project_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    parent_id VARCHAR(50) NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    progress INT NULL DEFAULT 0,
    dependencies VARCHAR(255) NULL DEFAULT '',
    assignee VARCHAR(100) NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

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

-- 이 파일은 신규 설치용이며 CREATE TABLE IF NOT EXISTS를 사용하므로 기존
-- pms_tasks 테이블과 그 안의 데이터는 변경하지 않습니다. 운영 테이블에
-- 제약조건이나 인덱스를 추가할 때는 사전 검증과 백업을 거친 별도 마이그레이션을
-- 사용하세요.

-- 운영 환경에서는 root 대신 이 애플리케이션 전용 계정을 사용하세요.
-- 비밀번호를 변경한 뒤 아래 주석을 해제해 실행합니다.
-- CREATE USER IF NOT EXISTS 'pms_reader'@'127.0.0.1' IDENTIFIED BY 'change-reader-password';
-- CREATE USER IF NOT EXISTS 'pms_writer'@'127.0.0.1' IDENTIFIED BY 'change-writer-password';
-- GRANT SELECT ON pms_db.pms_tasks TO 'pms_reader'@'127.0.0.1';
-- GRANT SELECT ON pms_db.pms_projects TO 'pms_reader'@'127.0.0.1';
-- GRANT SELECT ON pms_db.pms_project_phases TO 'pms_reader'@'127.0.0.1';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pms_db.pms_tasks TO 'pms_writer'@'127.0.0.1';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pms_db.pms_projects TO 'pms_writer'@'127.0.0.1';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pms_db.pms_project_phases TO 'pms_writer'@'127.0.0.1';
-- FLUSH PRIVILEGES;
