import pg from "pg";
const pool=new pg.Pool({connectionString:process.env.QUEUE_DATABASE_URL,connectionTimeoutMillis:3000});
try{const r=await pool.query("SELECT 1 FROM ops.service_heartbeat WHERE service='files' AND \"checkedAt\">now()-interval '30 seconds'");if(!r.rowCount)process.exitCode=1;}catch{process.exitCode=1;}finally{await pool.end();}
