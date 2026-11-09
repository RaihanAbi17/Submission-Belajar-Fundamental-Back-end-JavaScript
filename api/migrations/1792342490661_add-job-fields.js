exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_city varchar(255);
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_salary_visible boolean NOT NULL DEFAULT true;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status varchar(40) NOT NULL DEFAULT 'open';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE jobs DROP COLUMN IF EXISTS location_city;
    ALTER TABLE jobs DROP COLUMN IF EXISTS is_salary_visible;
    ALTER TABLE jobs DROP COLUMN IF EXISTS status;
  `);
};
