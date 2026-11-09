
require('dotenv').config();
const amqplib=require('amqplib');
const {Pool}=require('pg');
const nodemailer=require('nodemailer');

const pool=new Pool({host:process.env.PGHOST||'localhost',port:Number(process.env.PGPORT||5432),user:process.env.PGUSER||'postgres',password:process.env.PGPASSWORD,database:process.env.PGDATABASE||'openjob'});
async function main(){
  const conn=await amqplib.connect({protocol:'amqp',hostname:process.env.RABBITMQ_HOST||'localhost',port:Number(process.env.RABBITMQ_PORT||5672),username:process.env.RABBITMQ_USER||'guest',password:process.env.RABBITMQ_PASSWORD||'guest'});
  const ch=await conn.createChannel();const queue=process.env.RABBITMQ_QUEUE||'openjob_applications';
  await ch.assertQueue(queue,{durable:true});ch.prefetch(1);
  const transporter=nodemailer.createTransport({host:process.env.MAIL_HOST,port:Number(process.env.MAIL_PORT||587),secure:Number(process.env.MAIL_PORT)===465,auth:process.env.MAIL_USER?{user:process.env.MAIL_USER,pass:process.env.MAIL_PASSWORD}:undefined});
  console.log(`OpenJob consumer listening on ${queue}`);
  ch.consume(queue,async msg=>{
    if(!msg)return;
    try{
      const payload=JSON.parse(msg.content.toString());
      if(!payload.application_id)throw new Error('application_id is required');
      const {rows}=await pool.query(`
        SELECT a.id AS application_id,a.created_at AS application_date,
               applicant.name AS applicant_name,applicant.email AS applicant_email,
               owner.email AS owner_email,owner.name AS owner_name,j.title AS job_title
        FROM applications a
        JOIN users applicant ON applicant.id=a.user_id
        JOIN jobs j ON j.id=a.job_id
        JOIN companies c ON c.id=j.company_id
        JOIN users owner ON owner.id=c.owner_user_id
        WHERE a.id=$1`,[payload.application_id]);
      if(!rows.length)throw new Error('Application or job owner not found in database');
      const a=rows[0];
      if(!process.env.MAIL_HOST||!process.env.MAIL_USER||!process.env.MAIL_PASSWORD)throw new Error('MAIL_HOST, MAIL_USER and MAIL_PASSWORD must be configured');
      await transporter.sendMail({from:process.env.MAIL_FROM||process.env.MAIL_USER,to:a.owner_email,subject:`New application for ${a.job_title}`,text:`You received a new application.\\nApplicant email: ${a.applicant_email}\\nApplicant name: ${a.applicant_name}\\nApplication date: ${new Date(a.application_date).toLocaleString('id-ID')}\\nJob: ${a.job_title}`});
      ch.ack(msg);
    }catch(e){console.error('Failed to process application message:',e.message);ch.nack(msg,false,false);}
  });
}
main().catch(e=>{console.error(e);process.exit(1)});
