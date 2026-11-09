exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS cover_letter text;
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_url varchar(500);
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS application_date timestamp DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE bookmarks DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE applications DROP COLUMN IF EXISTS application_date;
    ALTER TABLE applications DROP COLUMN IF EXISTS resume_url;
    ALTER TABLE applications DROP COLUMN IF EXISTS cover_letter;
    ALTER TABLE applications DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE jobs DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE companies DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE categories DROP COLUMN IF EXISTS updated_at;
  `);
};
