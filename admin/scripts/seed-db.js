const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'kiosk',
  user: process.env.POSTGRES_USER || 'orange',
  password: process.env.POSTGRES_PASSWORD || '00oo00oo',
});

async function main() {
  console.log('Setting up initial data...\n');

  try {
    // Check if admin user exists
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = 'admin@admin.com'"
    );

    let userId;

    if (existingUser.rows.length > 0) {
      console.log('Admin user already exists');
      userId = existingUser.rows[0].id;
    } else {
      // Create admin user
      console.log('Creating admin user...');
      const passwordHash = await bcrypt.hash('admin123', 12);
      userId = crypto.randomUUID();

      await pool.query(
        'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
        [userId, 'admin@admin.com', passwordHash]
      );
      console.log('Admin user created with ID:', userId);
    }

    // Check if profile exists
    const existingProfile = await pool.query(
      'SELECT * FROM profiles WHERE user_id = $1',
      [userId]
    );

    if (existingProfile.rows.length > 0) {
      // Update to super_admin
      await pool.query(
        "UPDATE profiles SET role = 'super_admin', full_name = 'Super Admin' WHERE user_id = $1",
        [userId]
      );
      console.log('Profile updated to super_admin');
    } else {
      // Create profile
      await pool.query(
        `INSERT INTO profiles (user_id, email, full_name, role, is_active)
         VALUES ($1, 'admin@admin.com', 'Super Admin', 'super_admin', true)`,
        [userId]
      );
      console.log('Profile created as super_admin');
    }

    console.log('\n✅ Setup complete!');
    console.log('─────────────────────────────────');
    console.log('Email:    admin@admin.com');
    console.log('Password: admin123');
    console.log('─────────────────────────────────');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
