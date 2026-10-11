import pg from 'pg';
import bcrypt from 'bcryptjs';

// Minimal local seed. Usage (from server/):
//   SEED_PASSWORD='<choose-one>' DB_PASSWORD='<from .env>' npx tsx src/utils/seed.ts
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '15432', 10),
  database: process.env.DB_NAME || 'attendify',
  user: process.env.DB_USER || 'attendify_user',
  password: process.env.DB_PASSWORD,
});

async function seed() {
  console.log('Seeding...');

  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword || seedPassword.length < 8) {
    throw new Error('Set SEED_PASSWORD (8+ chars) for the seeded accounts.');
  }
  const hash = await bcrypt.hash(seedPassword, 12);

  await pool.query(`DELETE FROM enrollments`);
  await pool.query(`DELETE FROM courses`);
  await pool.query(`DELETE FROM departments`);
  await pool.query(`DELETE FROM institutions`);
  await pool.query(`DELETE FROM users`);

  await pool.query(`
    INSERT INTO institutions (id, name, code, city, contact_email, status) VALUES
    ('11111111-1111-1111-1111-111111111111', 'University of Management & Technology', 'UMT', 'Lahore', 'admin@umt.edu.pk', 'active')
  `);

  await pool.query(`
    INSERT INTO users (id, email, password_hash, full_name, role, institution_id, is_active) VALUES
    ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'admin@attendify.app', $1, 'System Administrator', 'system_admin', NULL, true),
    ('aaaaaaaa-bbbb-cccc-dddd-ffffffffffff', 'orgadmin@umt.edu.pk', $1, 'Dr. Kashif Mehmood', 'org_admin', '11111111-1111-1111-1111-111111111111', true),
    ('aaaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaaa', 'teacher@umt.edu.pk', $1, 'Prof. Sarah Khan', 'teacher', '11111111-1111-1111-1111-111111111111', true),
    ('aaaaaaaa-bbbb-cccc-dddd-bbbbbbbbbbbb', 'student@umt.edu.pk', $1, 'Muhammad Shakaib', 'student', '11111111-1111-1111-1111-111111111111', true),
    ('aaaaaaaa-bbbb-cccc-dddd-999999999999', 'student2@umt.edu.pk', $1, 'Haris Ali', 'student', '11111111-1111-1111-1111-111111111111', true)
  `, [hash]);

  await pool.query(`
    INSERT INTO departments (id, institution_id, name, code) VALUES
    ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Computer Science', 'CS'),
    ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Software Engineering', 'SE')
  `);

  await pool.query(`
    INSERT INTO courses (id, institution_id, teacher_id, department_id, name, code, credits, semester, academic_year, section) VALUES
    ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaaa', 'd0000000-0000-0000-0000-000000000001', 'Artificial Intelligence', 'CS401', 3, 'Fall', '2025-26', 'A'),
    ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaaa', 'd0000000-0000-0000-0000-000000000001', 'Database Management Systems', 'CS302', 3, 'Fall', '2025-26', 'A'),
    ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-bbbb-cccc-dddd-aaaaaaaaaaaa', 'd0000000-0000-0000-0000-000000000002', 'Software Engineering', 'SE301', 3, 'Fall', '2025-26', 'A')
  `);

  await pool.query(`
    INSERT INTO enrollments (institution_id, course_id, student_id) VALUES
    ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-bbbb-cccc-dddd-bbbbbbbbbbbb'),
    ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-bbbb-cccc-dddd-bbbbbbbbbbbb'),
    ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000003', 'aaaaaaaa-bbbb-cccc-dddd-bbbbbbbbbbbb'),
    ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-bbbb-cccc-dddd-999999999999'),
    ('11111111-1111-1111-1111-111111111111', 'c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-bbbb-cccc-dddd-999999999999')
  `);

  console.log('Seed complete. Accounts (password = SEED_PASSWORD):');
  console.log('  admin@attendify.app (system_admin)');
  console.log('  orgadmin@umt.edu.pk (org_admin)');
  console.log('  teacher@umt.edu.pk  (teacher)');
  console.log('  student@umt.edu.pk  (student)');
  console.log('  student2@umt.edu.pk (student)');
  await pool.end();
}

seed().catch(console.error);
