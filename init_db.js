require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🚀 Connecting to MySQL to initialize Birla Evam database using IPv4...');
  
  let connection;
  try {
    // Connect explicitly using IPv4 '127.0.0.1' and DB name to bypass localhost resolution gotchas
    connection = await mysql.createConnection({
      host: '127.0.0.1',
      user: 'root',
      password: '',
      database: 'birla_evam'
    });
    console.log('✅ Connected to MySQL birla_evam database.');
  } catch (err) {
    console.error('❌ Could not connect to MySQL server. Let\'s try to connect without database name first...');
    try {
      connection = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: ''
      });
      console.log('✅ Connected to MySQL server without database name.');
    } catch(err2) {
      console.error('❌ Failed to connect to MySQL completely. Is MySQL running on 3306?', err2.message);
      process.exit(1);
    }
  }

  try {
    // Read schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    
    // Split queries by semicolon
    const queries = sql
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0);

    console.log(`Executing ${queries.length} queries to initialize schema...`);
    for (const query of queries) {
      // Clean query
      await connection.query(query);
    }
    
    console.log('🎉 Database and tables successfully initialized!');
  } catch (err) {
    console.error('❌ Failed to execute schema initialization:', err.message);
  } finally {
    if (connection) await connection.end();
  }
}

main();
