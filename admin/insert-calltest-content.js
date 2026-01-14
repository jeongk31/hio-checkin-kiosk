const { Pool } = require('pg');

const pool = new Pool({
  user: 'orange',
  password: '00oo00oo',
  host: 'localhost',
  port: 5432,
  database: 'kiosk',
});

async function insertCallTestContent() {
  const client = await pool.connect();
  try {
    // Get all projects
    const { rows: projects } = await client.query('SELECT id FROM projects');
    
    for (const project of projects) {
      // Insert title
      await client.query(
        `INSERT INTO kiosk_content (project_id, content_key, content_value, language)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, content_key, language) 
         DO UPDATE SET content_value = EXCLUDED.content_value`,
        [project.id, 'calltest_welcome_title', '고객 서비스 테스트 모드', 'ko']
      );
      
      // Insert subtitle
      await client.query(
        `INSERT INTO kiosk_content (project_id, content_key, content_value, language)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, content_key, language) 
         DO UPDATE SET content_value = EXCLUDED.content_value`,
        [project.id, 'calltest_welcome_subtitle', '상단의 \'고객 서비스 요청\' 버튼을 사용하여 통화 기능을 테스트하세요', 'ko']
      );
      
      console.log(`✓ Added call test content for project: ${project.id}`);
    }
    
    console.log('\n✓ All done!');
  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

insertCallTestContent();
