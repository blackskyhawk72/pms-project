CREATE DATABASE IF NOT EXISTS pms_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_general_ci;

USE pms_db;

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

-- 이 파일은 신규 설치용이며 CREATE TABLE IF NOT EXISTS를 사용하므로 기존
-- pms_tasks 테이블과 그 안의 데이터는 변경하지 않습니다. 운영 테이블에
-- 제약조건이나 인덱스를 추가할 때는 사전 검증과 백업을 거친 별도 마이그레이션을
-- 사용하세요.

-- 운영 환경에서는 root 대신 이 애플리케이션 전용 계정을 사용하세요.
-- 비밀번호를 변경한 뒤 아래 주석을 해제해 실행합니다.
-- CREATE USER IF NOT EXISTS 'pms_app'@'127.0.0.1' IDENTIFIED BY 'change-me';
-- GRANT SELECT ON pms_db.pms_tasks TO 'pms_app'@'127.0.0.1';
-- FLUSH PRIVILEGES;
