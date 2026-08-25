require('dotenv').config();
const p=require('./db');
(async()=>{
  const r=await p.query("SELECT column_name FROM information_schema.columns WHERE table_name='products' ORDER BY ordinal_position");
  console.log(r.rows.map(x=>x.column_name));
  process.exit(0)
})();
