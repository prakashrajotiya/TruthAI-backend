const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgres://postgres:%3F4%26kY8yhMFtVqFn@db.mdulffjjeizbewkhvcww.supabase.co:5432/postgres'
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL!");
    
    // Disable RLS so backend with anon key can insert
    await client.query('ALTER TABLE documents DISABLE ROW LEVEL SECURITY;');
    console.log("RLS disabled successfully.");
    
    // Also, if not enabled, just in case, allow all operations
    await client.query(`
      DROP POLICY IF EXISTS "Allow all" ON documents;
      CREATE POLICY "Allow all" ON documents FOR ALL USING (true) WITH CHECK (true);
    `);
    console.log("Policies updated.");
    
  } catch (err) {
    console.error("Database error:", err);
  } finally {
    await client.end();
  }
}

run();
