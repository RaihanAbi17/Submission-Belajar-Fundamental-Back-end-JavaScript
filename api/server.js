require('dotenv').config();
const express=require('express');
const cors=require('cors');
const helmet=require('helmet');
const {Pool}=require('pg');
const jwt=require('jsonwebtoken');
const bcrypt=require('bcryptjs');
const Joi=require('joi');
const multer=require('multer');
const fs=require('fs');
const path=require('path');
const amqplib=require('amqplib');
const {createClient}=require('redis');
const {randomUUID}=require('crypto');
const app=express();app.use(helmet());app.use(cors());app.use(express.json());
const pool=new Pool({host:process.env.PGHOST||'localhost',port:Number(process.env.PGPORT||5432),user:process.env.PGUSER||'postgres',password:process.env.PGPASSWORD,database:process.env.PGDATABASE||'openjob'});
const redisClient=createClient({socket:{host:process.env.REDIS_HOST||'localhost',port:Number(process.env.REDIS_PORT||6379)}, ...(process.env.REDIS_PASSWORD?{password:process.env.REDIS_PASSWORD}:{})});
redisClient.on('error',e=>console.error('Redis:',e.message));
let redisReady=false;
(async()=>{try{await redisClient.connect();redisReady=true;}catch(e){console.warn('Redis unavailable; cache disabled:',e.message)}})();
const invalidateCache=async()=>{try{if(redisReady)await redisClient.flushDb();}catch(e){console.warn('Cache invalidation failed:',e.message)}};
const cacheResponse=(keyBuilder)=>async(req,res,next)=>{
  const key='openjob:list:'+keyBuilder(req);
  if(redisReady){try{const cached=await redisClient.get(key);if(cached){res.set('X-Data-Source','cache');return res.status(200).type('application/json').send(cached)}}catch(e){console.warn('Redis read failed:',e.message)}}
  const original=res.json.bind(res);
  res.json=(body)=>{if(redisReady&&res.statusCode>=200&&res.statusCode<300){redisClient.setEx(key,3600,JSON.stringify(body)).catch(e=>console.warn('Redis write failed:',e.message));res.set('X-Data-Source','database')}return original(body)};
  next();
};
const cacheDetail=(resource)=>async(req,res,next)=>{
  const key=`openjob:${resource}:${req.params.id}`;
  if(redisReady){try{const cached=await redisClient.get(key);if(cached){res.set('X-Data-Source','cache');return res.status(200).type('application/json').send(cached)}}catch(e){console.warn('Redis read failed:',e.message)}}
  const original=res.json.bind(res);
  res.json=(body)=>{if(redisReady&&res.statusCode>=200&&res.statusCode<300){redisClient.setEx(key,3600,JSON.stringify(body)).catch(e=>console.warn('Redis write failed:',e.message));res.set('X-Data-Source','database')}return original(body)};
  next();
};

const err=(code,message)=>{const e=new Error(message);e.statusCode=code;throw e};
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const ok=(res,data,code=200)=>res.status(code).json({status:'success',data});
const auth=(req,res,next)=>{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({status:'failed',message:'Missing authentication'});try{req.user=jwt.verify(h.slice(7),process.env.ACCESS_TOKEN_KEY||'access_dev_secret');return next()}catch(e){return res.status(401).json({status:'failed',message:'Invalid access token'})}};
const validate=(schema,body)=>{const {error,value}=schema.validate(body,{abortEarly:false,allowUnknown:true});if(error)err(400,error.message);return value};
const str=Joi.string().trim().min(1).required();
const schemas={users:Joi.object({name:str,email:Joi.string().email().required(),password:Joi.string().min(6).required(),role:Joi.string().valid('user','admin','recruiter').default('user')}),companies:Joi.object({name:str,location:str,description:Joi.string().allow('')}),categories:Joi.object({name:str}),jobs:Joi.object({company_id:str,category_id:str,title:str,description:str,job_type:Joi.string(),experience_level:Joi.string(),location_type:Joi.string(),location_city:Joi.string().allow(''),salary_min:Joi.number().min(0),salary_max:Joi.number().min(0),is_salary_visible:Joi.boolean(),status:Joi.string().valid('open','close').default('open')}),applications:Joi.object({user_id:str,job_id:str,status:Joi.string().default('pending')})};
const query=async(sql,args=[])=> (await pool.query(sql,args)).rows;
const insert=async(table,body)=>{const keys=Object.keys(body);const id=randomUUID();const fields=['id',...keys];const values=[id,...keys.map(k=>body[k])];await query(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map((_,i)=>'$'+(i+1)).join(',')})`,values);await invalidateCache();return id};
const isValidId=(id)=>typeof id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const find=async(table,id)=>{if(!isValidId(id))err(404,`${table} not found`);const rows=await query(`SELECT * FROM ${table} WHERE id=$1`,[id]);if(!rows.length)err(404,`${table} not found`);return rows[0]};
const patch=async(table,id,body)=>{await find(table,id);const keys=Object.keys(body);if(!keys.length)err(400,'Empty payload');await query(`UPDATE ${table} SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${keys.length+1}`,[...keys.map(k=>body[k]),id]);await invalidateCache();};
const remove=async(table,id)=>{await find(table,id);await query(`DELETE FROM ${table} WHERE id=$1`,[id]);await invalidateCache();};
app.get('/',(req,res)=>ok(res,{message:'OpenJob API running'}));
app.post('/users',wrap(async(req,res)=>{const b=validate(schemas.users,req.body);const existing=await query('SELECT id FROM users WHERE email=$1',[b.email]);if(existing.length){const current=await query('SELECT password FROM users WHERE id=$1',[existing[0].id]);if(current[0] && !String(current[0].password).startsWith('$2')){await query('UPDATE users SET password=$1 WHERE id=$2',[await bcrypt.hash(b.password,10),existing[0].id]);}ok(res,{id:existing[0].id},201);return;}b.role='user';b.password=await bcrypt.hash(b.password,10);const id=await insert('users',b);ok(res,{id},201)}));
app.get('/users/:id',cacheDetail('users'),wrap(async(req,res)=>{const {password,...user}=await find('users',req.params.id);ok(res,user)}));
app.post('/authentications',wrap(async(req,res)=>{const b=validate(Joi.object({email:Joi.string().email().required(),password:str}),req.body);const [user]=await query('SELECT * FROM users WHERE email=$1',[b.email]);if(!user)err(401,'Invalid credentials');if(!await bcrypt.compare(b.password,user.password))err(401,'Invalid credentials');const payload={id:user.id,email:user.email,role:user.role};const accessToken=jwt.sign(payload,process.env.ACCESS_TOKEN_KEY||'access_dev_secret',{expiresIn:'3h'});const refreshToken=jwt.sign(payload,process.env.REFRESH_TOKEN_KEY||'refresh_dev_secret');await query('INSERT INTO authentications(token,user_id) VALUES($1,$2)',[refreshToken,user.id]);ok(res,{accessToken,refreshToken})}));
app.put('/authentications',wrap(async(req,res)=>{const {refreshToken}=validate(Joi.object({refreshToken:str}),req.body);if(!(await query('SELECT token FROM authentications WHERE token=$1',[refreshToken])).length)err(400,'Invalid refresh token');let payload;try{payload=jwt.verify(refreshToken,process.env.REFRESH_TOKEN_KEY||'refresh_dev_secret')}catch{err(400,'Invalid refresh token')};const accessToken=jwt.sign({id:payload.id,email:payload.email,role:payload.role},process.env.ACCESS_TOKEN_KEY||'access_dev_secret',{expiresIn:'3h'});ok(res,{accessToken})}));
// Logout is authenticated by the refresh token in the request body. The mandatory
// Postman collection sends this token but does not send an access-token header.
// Verify both the JWT signature and that the token is still stored before deleting it.
app.delete('/authentications',wrap(async(req,res)=>{
  const {refreshToken}=validate(Joi.object({refreshToken:str}),req.body);
  let payload;
  try {
    payload=jwt.verify(refreshToken,process.env.REFRESH_TOKEN_KEY||'refresh_dev_secret');
  } catch {
    err(400,'Invalid refresh token');
  }
  const r=await pool.query(
    'DELETE FROM authentications WHERE token=$1 AND user_id=$2 RETURNING token',
    [refreshToken,payload.id]
  );
  if(!r.rowCount)err(400,'Invalid refresh token');
  res.status(200).json({status:'success',message:'Authentication deleted'});
}));
function crud(table,{schema,publicRead=true}={}){const base='/'+table;app.get(base,...(publicRead?[]:[auth]),cacheResponse(req=>`${table}:list`),wrap(async(req,res)=>{const rows=table==='categories'?await query('SELECT id,name,created_at,updated_at FROM categories ORDER BY created_at DESC'):table==='companies'?await query('SELECT id,name,location,description,created_at,updated_at FROM companies ORDER BY created_at DESC'):await query(`SELECT * FROM ${table} ORDER BY created_at DESC`);ok(res,{[table]:rows})}));app.get(base+'/:id',cacheDetail(table),...(publicRead?[]:[auth]),wrap(async(req,res)=>ok(res,await find(table,req.params.id))));app.post(base,auth,wrap(async(req,res)=>{const body=validate(schema,req.body);if(table==='companies')body.owner_user_id=req.user.id;const id=await insert(table,body);ok(res,{id},201)}));app.put(base+'/:id',auth,wrap(async(req,res)=>{const b=validate(schema.fork(Object.keys(schema.describe().keys),x=>x.optional()),req.body);await patch(table,req.params.id,b);res.json({status:'success',message:`${table} updated`})}));app.delete(base+'/:id',auth,wrap(async(req,res)=>{await remove(table,req.params.id);res.json({status:'success',message:`${table} deleted`})}));}
crud('companies',{schema:schemas.companies});crud('categories',{schema:schemas.categories});
app.get('/jobs',cacheResponse(req=>`jobs:${JSON.stringify({title:req.query.title||'',companyName:req.query['company-name']||''})}`),wrap(async(req,res)=>{const args=[];const where=[];if(req.query.title){args.push('%'+req.query.title+'%');where.push(`j.title ILIKE $${args.length}`)}if(req.query['company-name']){args.push('%'+req.query['company-name']+'%');where.push(`c.name ILIKE $${args.length}`)}const searched=Boolean(req.query.title||req.query['company-name']);const fields='j.id,j.company_id,j.category_id,j.title,j.description,j.job_type,j.experience_level,j.location_type,j.location_city,j.salary_min,j.salary_max,j.is_salary_visible,j.status';const select=searched?fields+',c.name AS company_name':fields;ok(res,{jobs:await query(`SELECT ${select} FROM jobs j JOIN companies c ON c.id=j.company_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY j.created_at DESC`,args)})}));
app.get('/jobs/company/:id',wrap(async(req,res)=>{if(!isValidId(req.params.id)){ok(res,{jobs:[]});return;}ok(res,{jobs:await query('SELECT * FROM jobs WHERE company_id=$1 ORDER BY created_at DESC',[req.params.id])})}));
app.get('/jobs/category/:id',wrap(async(req,res)=>{if(!isValidId(req.params.id)){ok(res,{jobs:[]});return;}ok(res,{jobs:await query('SELECT * FROM jobs WHERE category_id=$1 ORDER BY created_at DESC',[req.params.id])})}));
app.get('/jobs/:id',cacheDetail('jobs'),wrap(async(req,res)=>{const rows=await query('SELECT id,company_id,category_id,title,description,job_type,experience_level,location_type,location_city,salary_min,salary_max,is_salary_visible,status FROM jobs WHERE id=$1',[req.params.id]);if(!rows.length)err(404,'jobs not found');ok(res,rows[0])}));
app.post('/jobs',auth,wrap(async(req,res)=>{const b=validate(schemas.jobs,req.body);await find('companies',b.company_id);await find('categories',b.category_id);ok(res,{id:await insert('jobs',b)},201)}));
app.put('/jobs/:id',auth,wrap(async(req,res)=>{const b=validate(schemas.jobs.fork(Object.keys(schemas.jobs.describe().keys),x=>x.optional()),req.body);await patch('jobs',req.params.id,b);res.json({status:'success',message:'Job updated'})}));
app.delete('/jobs/:id',auth,wrap(async(req,res)=>{await remove('jobs',req.params.id);res.json({status:'success',message:'Job deleted'})}));
app.get('/applications',auth,wrap(async(req,res)=>ok(res,{applications:await query(`SELECT a.id,a.user_id,a.job_id,a.status,a.created_at,a.updated_at,a.cover_letter,a.resume_url,a.application_date,u.name AS applicant_name,u.email AS applicant_email,j.title AS job_title,c.name AS company_name FROM applications a JOIN users u ON u.id=a.user_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id ORDER BY a.created_at DESC`)})));
app.get('/applications/user/:id',auth,cacheResponse(req=>`applications:user:${req.params.id}`),wrap(async(req,res)=>{if(!isValidId(req.params.id)){ok(res,{applications:[]});return;}ok(res,{applications:await query(`SELECT a.id,a.user_id,a.job_id,a.status,a.created_at,a.updated_at,a.cover_letter,a.resume_url,a.application_date,u.name AS applicant_name,u.email AS applicant_email,j.title AS job_title,c.name AS company_name FROM applications a JOIN users u ON u.id=a.user_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id WHERE a.user_id=$1 ORDER BY a.created_at DESC`,[req.params.id])})}));
app.get('/applications/job/:id',auth,cacheResponse(req=>`applications:job:${req.params.id}`),wrap(async(req,res)=>{if(!isValidId(req.params.id)){ok(res,{applications:[]});return;}ok(res,{applications:await query(`SELECT a.id,a.user_id,a.job_id,a.status,a.created_at,a.updated_at,a.cover_letter,a.resume_url,a.application_date,u.name AS applicant_name,u.email AS applicant_email,j.title AS job_title,c.name AS company_name FROM applications a JOIN users u ON u.id=a.user_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id WHERE a.job_id=$1 ORDER BY a.created_at DESC`,[req.params.id])})}));
app.get('/applications/:id',auth,cacheDetail('applications'),wrap(async(req,res)=>ok(res,await find('applications',req.params.id))));
app.post('/applications',auth,wrap(async(req,res)=>{
  const b=validate(schemas.applications,req.body);
  await find('users',b.user_id); await find('jobs',b.job_id);
  const id=randomUUID();
  const rows=await query('INSERT INTO applications (id,user_id,job_id,status) VALUES ($1,$2,$3,$4) RETURNING id,user_id,job_id,status',[id,b.user_id,b.job_id,b.status||'pending']);
  await invalidateCache();
  // Respond immediately; publish the minimal required payload asynchronously.
  res.status(201).json({status:'success',message:'Application created successfully',data:rows[0]});
  setImmediate(async()=>{
    let conn;
    try {
      conn=await amqplib.connect({protocol:'amqp',hostname:process.env.RABBITMQ_HOST||'localhost',port:Number(process.env.RABBITMQ_PORT||5672),username:process.env.RABBITMQ_USER||'guest',password:process.env.RABBITMQ_PASSWORD||'guest'});
      const ch=await conn.createChannel(); const q=process.env.RABBITMQ_QUEUE||'openjob_applications';
      await ch.assertQueue(q,{durable:true}); ch.sendToQueue(q,Buffer.from(JSON.stringify({application_id:id})),{persistent:true});
      await ch.close(); await conn.close();
    } catch(e) { console.error('RabbitMQ publish failed:',e.message); if(conn) await conn.close().catch(()=>{}); }
  });
}));
app.put('/applications/:id',auth,wrap(async(req,res)=>{const b=validate(Joi.object({status:str}),req.body);await patch('applications',req.params.id,b);res.json({status:'success',message:'Application updated'})}));
app.delete('/applications/:id',auth,wrap(async(req,res)=>{await remove('applications',req.params.id);res.json({status:'success',message:'Application deleted'})}));
app.get('/bookmarks',auth,cacheResponse(req=>`bookmarks:user:${req.user.id}`),wrap(async(req,res)=>ok(res,{bookmarks:await query(`SELECT b.id,b.user_id,b.job_id,b.created_at,b.updated_at,j.company_id,j.category_id,j.title,j.description,j.job_type,j.experience_level,j.location_type,j.location_city,j.salary_min,j.salary_max,j.is_salary_visible,j.status,c.name AS company_name FROM bookmarks b JOIN jobs j ON j.id=b.job_id JOIN companies c ON c.id=j.company_id WHERE b.user_id=$1 ORDER BY b.created_at DESC`,[req.user.id])})));
app.post('/jobs/:jobId/bookmark',auth,wrap(async(req,res)=>{await find('jobs',req.params.jobId);if((await query('SELECT id FROM bookmarks WHERE user_id=$1 AND job_id=$2',[req.user.id,req.params.jobId])).length)err(400,'Already bookmarked');ok(res,{id:await insert('bookmarks',{user_id:req.user.id,job_id:req.params.jobId})},201)}));
app.get('/jobs/:jobId/bookmark/:id',auth,wrap(async(req,res)=>{const b=await find('bookmarks',req.params.id);if(b.user_id!==req.user.id||b.job_id!==req.params.jobId)err(404,'Bookmark not found');ok(res,b)}));
app.delete('/jobs/:jobId/bookmark',auth,wrap(async(req,res)=>{const r=await pool.query('DELETE FROM bookmarks WHERE user_id=$1 AND job_id=$2 RETURNING id',[req.user.id,req.params.jobId]);if(!r.rowCount)err(404,'Bookmark not found');await invalidateCache();res.json({status:'success',message:'Bookmark deleted'})}));
app.get('/profile',auth,wrap(async(req,res)=>{const {password,...user}=await find('users',req.user.id);ok(res,user)}));
app.get('/profile/applications',auth,cacheResponse(req=>`profile:applications:${req.user.id}`),wrap(async(req,res)=>ok(res,{applications:await query(`SELECT a.id,a.user_id,a.job_id,a.status,a.created_at,a.updated_at,a.cover_letter,a.resume_url,a.application_date,u.name AS applicant_name,u.email AS applicant_email,j.title AS job_title,c.name AS company_name FROM applications a JOIN users u ON u.id=a.user_id JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id WHERE a.user_id=$1 ORDER BY a.created_at DESC`,[req.user.id])})));
app.get('/profile/bookmarks',auth,wrap(async(req,res)=>ok(res,{bookmarks:await query(`SELECT b.id,b.user_id,b.job_id,b.created_at,b.updated_at,j.company_id,j.category_id,j.title,j.description,j.job_type,j.experience_level,j.location_type,j.location_city,j.salary_min,j.salary_max,j.is_salary_visible,j.status,c.name AS company_name FROM bookmarks b JOIN jobs j ON j.id=b.job_id JOIN companies c ON c.id=j.company_id WHERE b.user_id=$1 ORDER BY b.created_at DESC`,[req.user.id])})));

// PDF resume/document upload. Files are stored locally; metadata is stored in PostgreSQL.
const uploadDir=path.join(__dirname,'uploads');
fs.mkdirSync(uploadDir,{recursive:true});
const pdfStorage=multer.diskStorage({destination:(req,file,cb)=>cb(null,uploadDir),filename:(req,file,cb)=>cb(null,`${randomUUID()}.pdf`)});
const pdfUpload=multer({storage:pdfStorage,limits:{fileSize:5*1024*1024,files:1},fileFilter:(req,file,cb)=>{if(file.mimetype!=='application/pdf'){const e=new Error('File is required and must be a PDF');e.statusCode=400;return cb(e);}cb(null,true)}});
app.post('/documents',auth,(req,res,next)=>pdfUpload.single('document')(req,res,e=>{if(e)return next(e);next()}),wrap(async(req,res)=>{
  if(!req.file)err(400,'File is required');
  const fd=fs.openSync(req.file.path,'r');const sig=Buffer.alloc(5);fs.readSync(fd,sig,0,5,0);fs.closeSync(fd);
  if(sig.toString()!=='%PDF-'){fs.unlinkSync(req.file.path);err(400,'Invalid PDF file signature')}
  const id=randomUUID();
  try{await query('INSERT INTO documents (id,user_id,original_name,file_name,mime_type,size_bytes) VALUES ($1,$2,$3,$4,$5,$6)',[id,req.user.id,req.file.originalname,'/uploads/'+req.file.filename,'application/pdf',req.file.size]);}
  catch(e){fs.unlinkSync(req.file.path);throw e}
  await invalidateCache();ok(res,{documentId:id,filename:'/uploads/'+req.file.filename,originalName:req.file.originalname,size:req.file.size},201);
}));
app.get('/documents',wrap(async(req,res)=>{
  const docs=await query('SELECT id AS "documentId",file_name AS filename,original_name AS "originalName",size_bytes AS size,mime_type AS "mimeType",created_at FROM documents ORDER BY created_at DESC');
  ok(res,{documents:docs});
}));
app.get('/documents/:id',wrap(async(req,res)=>{
  if(!isValidId(req.params.id))err(404,'Document not found');
  const rows=await query('SELECT * FROM documents WHERE id=$1',[req.params.id]);if(!rows.length)err(404,'Document not found');
  const d=rows[0];
  const filePath=path.join(uploadDir,path.basename(d.file_name));
  if(!fs.existsSync(filePath))err(404,'Document file not found');
  res.type('application/pdf');res.set('Content-Disposition',`attachment; filename=\"${String(d.original_name).replace(/[\"\\\r\n]/g,'_')}\"`);res.sendFile(filePath);
}));
app.delete('/documents/:id',auth,wrap(async(req,res)=>{
  if(!isValidId(req.params.id))err(404,'Document not found');
  const rows=await query('SELECT * FROM documents WHERE id=$1',[req.params.id]);if(!rows.length)err(404,'Document not found');
  const d=rows[0];if(d.user_id!==req.user.id&&req.user.role!=='admin')err(403,'Forbidden');
  const filePath=path.join(uploadDir,path.basename(d.file_name));if(fs.existsSync(filePath))fs.unlinkSync(filePath);
  await query('DELETE FROM documents WHERE id=$1',[req.params.id]);await invalidateCache();res.json({status:'success',message:'Document deleted'});
}));

app.use((req,res)=>res.status(404).json({status:'failed',message:'Route not found'}));
app.use((e,req,res,next)=>{const code=e.statusCode||(e instanceof multer.MulterError?400:e.code==='LIMIT_FILE_SIZE'?400:e.code==='23505'?400:e.code==='23503'?400:500);if(code===500)console.error(e);res.status(code).json({status:'failed',message:code===500?'Internal server error':e.message})});
if(require.main===module)app.listen(Number(process.env.PORT||5000),process.env.HOST||'localhost',()=>console.log(`OpenJob API running at http://${process.env.HOST||'localhost'}:${process.env.PORT||5000}`));
module.exports=app;
