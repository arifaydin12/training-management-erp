-- Training Management ERP - SQL Server schema (idempotent).
-- Run it with `npm run db:init`, which also creates the database named by DB_NAME.
-- Statements are separated by lines that contain only GO.

-- Application users. Passwords are stored as bcrypt hashes.
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
CREATE TABLE dbo.users (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    username       NVARCHAR(50)  NOT NULL,
    password_hash  NVARCHAR(100) NOT NULL,
    full_name      NVARCHAR(100) NOT NULL,
    role           NVARCHAR(20)  NOT NULL
        CONSTRAINT df_users_role DEFAULT N'viewer'
        CONSTRAINT ck_users_role CHECK (role IN (N'admin', N'hr_manager', N'viewer')),
    is_active      BIT           NOT NULL CONSTRAINT df_users_active DEFAULT 1,
    created_at     DATETIME2(0)  NOT NULL CONSTRAINT df_users_created DEFAULT SYSUTCDATETIME(),
    last_login_at  DATETIME2(0)  NULL,
    CONSTRAINT uq_users_username UNIQUE (username)
);
GO

-- Employees
IF OBJECT_ID(N'dbo.employees', N'U') IS NULL
CREATE TABLE dbo.employees (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    employee_number  NVARCHAR(20)  NOT NULL,
    full_name        NVARCHAR(100) NOT NULL,
    email            NVARCHAR(120) NOT NULL,
    department       NVARCHAR(60)  NOT NULL,
    job_title        NVARCHAR(80)  NOT NULL,
    hire_date        DATE          NULL,
    status           NVARCHAR(10)  NOT NULL
        CONSTRAINT df_employees_status DEFAULT N'active'
        CONSTRAINT ck_employees_status CHECK (status IN (N'active', N'inactive')),
    created_at       DATETIME2(0)  NOT NULL CONSTRAINT df_employees_created DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2(0)  NOT NULL CONSTRAINT df_employees_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_employees_number UNIQUE (employee_number),
    CONSTRAINT uq_employees_email  UNIQUE (email)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_employees_department' AND object_id = OBJECT_ID(N'dbo.employees'))
    CREATE INDEX ix_employees_department ON dbo.employees (department);
GO

-- Training sessions
IF OBJECT_ID(N'dbo.trainings', N'U') IS NULL
CREATE TABLE dbo.trainings (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    title        NVARCHAR(150)  NOT NULL,
    description  NVARCHAR(1000) NULL,
    category     NVARCHAR(40)   NOT NULL,
    trainer      NVARCHAR(100)  NOT NULL,
    location     NVARCHAR(100)  NULL,
    start_date   DATE           NOT NULL,
    end_date     DATE           NOT NULL,
    capacity     INT            NOT NULL CONSTRAINT ck_trainings_capacity CHECK (capacity BETWEEN 1 AND 1000),
    budget       DECIMAL(12,2)  NOT NULL CONSTRAINT df_trainings_budget DEFAULT 0
        CONSTRAINT ck_trainings_budget CHECK (budget >= 0),
    status       NVARCHAR(20)   NOT NULL
        CONSTRAINT df_trainings_status DEFAULT N'planned'
        CONSTRAINT ck_trainings_status CHECK (status IN (N'planned', N'in_progress', N'completed', N'cancelled')),
    created_at   DATETIME2(0)   NOT NULL CONSTRAINT df_trainings_created DEFAULT SYSUTCDATETIME(),
    updated_at   DATETIME2(0)   NOT NULL CONSTRAINT df_trainings_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_trainings_dates CHECK (end_date >= start_date)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_trainings_start_date' AND object_id = OBJECT_ID(N'dbo.trainings'))
    CREATE INDEX ix_trainings_start_date ON dbo.trainings (start_date);
GO

-- Participation (employee <-> training)
IF OBJECT_ID(N'dbo.training_participants', N'U') IS NULL
CREATE TABLE dbo.training_participants (
    training_id  INT NOT NULL
        CONSTRAINT fk_tp_training REFERENCES dbo.trainings(id) ON DELETE CASCADE,
    employee_id  INT NOT NULL
        CONSTRAINT fk_tp_employee REFERENCES dbo.employees(id) ON DELETE CASCADE,
    status       NVARCHAR(10) NOT NULL
        CONSTRAINT df_tp_status DEFAULT N'enrolled'
        CONSTRAINT ck_tp_status CHECK (status IN (N'enrolled', N'attended', N'completed', N'absent')),
    enrolled_at  DATETIME2(0) NOT NULL CONSTRAINT df_tp_enrolled DEFAULT SYSUTCDATETIME(),
    updated_at   DATETIME2(0) NOT NULL CONSTRAINT df_tp_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_training_participants PRIMARY KEY (training_id, employee_id)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_tp_employee' AND object_id = OBJECT_ID(N'dbo.training_participants'))
    CREATE INDEX ix_tp_employee ON dbo.training_participants (employee_id);
GO

-- Simple audit trail of write operations
IF OBJECT_ID(N'dbo.audit_log', N'U') IS NULL
CREATE TABLE dbo.audit_log (
    id          BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id     INT           NULL,
    username    NVARCHAR(50)  NULL,
    action      NVARCHAR(50)  NOT NULL,
    entity      NVARCHAR(30)  NOT NULL,
    entity_id   INT           NULL,
    details     NVARCHAR(500) NULL,
    created_at  DATETIME2(0)  NOT NULL CONSTRAINT df_audit_created DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_audit_created' AND object_id = OBJECT_ID(N'dbo.audit_log'))
    CREATE INDEX ix_audit_created ON dbo.audit_log (created_at DESC);
GO
