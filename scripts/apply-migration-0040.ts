import "dotenv/config";
import { readFileSync } from "fs";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const sql = readFileSync("migrations/0040_inventory_price_cents_bigint.sql", "utf8");
await pool.query(sql);
console.log("0040 applied");

const cols = await pool.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_name IN ('inventory_listings', 'contact_inventory_opportunities')
    AND column_name LIKE '%price_cents%'
  ORDER BY table_name, column_name
`);
console.log(cols.rows);

await pool.query(`SELECT $1::bigint AS ok`, [2650000000]);
console.log("2650000000 fits bigint: OK");

await pool.end();
