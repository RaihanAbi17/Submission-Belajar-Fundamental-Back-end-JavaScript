// Baseline schema. IF NOT EXISTS prevents failures when a local database already
// contains tables created manually or by an earlier version of this submission.
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS users (
      id varchar(64) PRIMARY KEY,
      name varchar(255) NOT NULL,
      email varchar(255) NOT NULL UNIQUE,
      password text NOT NULL,
      role varchar(40) NOT NULL DEFAULT 'user',
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS companies (
      id varchar(64) PRIMARY KEY,
      name varchar(255) NOT NULL,
      location varchar(255),
      description text,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id varchar(64) PRIMARY KEY,
      name varchar(255) NOT NULL,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id varchar(64) PRIMARY KEY,
      company_id varchar(64) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      category_id varchar(64) NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      title varchar(255) NOT NULL,
      description text NOT NULL,
      job_type varchar(100),
      experience_level varchar(100),
      location_type varchar(100),
      salary_min numeric,
      salary_max numeric,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS applications (
      id varchar(64) PRIMARY KEY,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id varchar(64) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      status varchar(50) NOT NULL DEFAULT 'pending',
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id varchar(64) PRIMARY KEY,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id varchar(64) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT bookmarks_user_job_unique UNIQUE (user_id, job_id)
    );

    CREATE TABLE IF NOT EXISTS authentications (
      token text PRIMARY KEY,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS jobs_title_idx ON jobs(title);
    CREATE INDEX IF NOT EXISTS companies_name_idx ON companies(name);
    CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_user_job_unique_idx ON bookmarks(user_id, job_id);
  `);
};

// Roll back only through the migration tool on a disposable development database.
exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS authentications;
    DROP TABLE IF EXISTS bookmarks;
    DROP TABLE IF EXISTS applications;
    DROP TABLE IF EXISTS jobs;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS companies;
    DROP TABLE IF EXISTS users;
  `);
};
