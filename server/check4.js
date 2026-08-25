require('dotenv').config();
const p=require('./db');
(async()=>{
  for(const t of ['customers','utang_transactions','users','sale_items','expenses','sales']){
    const r=await p.query("SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position",[t]);
    console.log(t, r.rows.map(x=>x.column_name).join(', '))
  }
  process.exit(0)
})();
