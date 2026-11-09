exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS documents (
      id varchar(64) PRIMARY KEY,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      original_name varchar(255) NOT NULL,
      file_name varchar(500) NOT NULL,
      mime_type varchar(100) NOT NULL,
      size_bytes integer NOT NULL,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner_user_id varchar(64) REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS cover_letter text;
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_url varchar(500);
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS application_date timestamp DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
    CREATE UNIQUE INDEX IF NOT EXISTS applications_user_job_unique_idx ON applications(user_id, job_id);
  `);
};
exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS applications_user_job_unique_idx;
    ALTER TABLE bookmarks DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE applications DROP COLUMN IF EXISTS application_date;
    ALTER TABLE applications DROP COLUMN IF EXISTS resume_url;
    ALTER TABLE applications DROP COLUMN IF EXISTS cover_letter;
    ALTER TABLE applications DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE jobs DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE companies DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE categories DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE companies DROP COLUMN IF EXISTS owner_user_id;
    DROP TABLE IF EXISTS documents;
  `);
};
