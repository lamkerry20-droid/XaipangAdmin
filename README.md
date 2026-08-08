# ระบบติดตามลูกหนี้ — วิธี Deploy ให้ได้ URL จริง

## ขั้นตอนที่ 1: สร้างฐานข้อมูลบน Supabase (ฟรี)

1. ไปที่ https://supabase.com แล้วสมัครสมาชิก (ใช้ GitHub login ได้)
2. กด "New Project" ตั้งชื่อโปรเจกต์ ตั้งรหัสผ่านฐานข้อมูล แล้วรอสักครู่ให้สร้างเสร็จ
3. ไปที่เมนู **SQL Editor** ทางซ้าย แล้ววางโค้ดนี้ กด Run:

```sql
create table debtors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  amount numeric not null,
  status text not null default 'not_contacted',
  logs jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table debtors enable row level security;

create policy "Allow all access" on debtors
  for all using (true) with check (true);
```

> หมายเหตุ: policy นี้เปิดให้ใครก็ตามที่มีลิงก์เว็บเข้าถึงข้อมูลได้ทั้งหมด เหมาะสำหรับใช้งานภายในทีมที่ไว้ใจกัน ถ้าต้องการจำกัดสิทธิ์เพิ่มเติม (เช่น ต้อง login ก่อน) แจ้งได้ จะช่วยปรับให้

4. ไปที่เมนู **Project Settings > API** คัดลอกค่า 2 อย่าง:
   - **Project URL**
   - **anon public key**

## ขั้นตอนที่ 2: อัปโค้ดขึ้น GitHub

1. สร้าง repository ใหม่บน https://github.com (เช่นชื่อ `debt-tracker`)
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้น repo นั้น (ลาก-วางผ่านหน้าเว็บ GitHub ได้เลยถ้าไม่ถนัด command line)

## ขั้นตอนที่ 3: Deploy บน Vercel (ฟรี)

1. ไปที่ https://vercel.com สมัครสมาชิกด้วย GitHub account
2. กด "Add New Project" แล้วเลือก repo `debt-tracker` ที่เพิ่งสร้าง
3. ก่อนกด Deploy ให้เปิดส่วน **Environment Variables** แล้วใส่:
   - `NEXT_PUBLIC_SUPABASE_URL` = ค่า Project URL จาก Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = ค่า anon public key จาก Supabase
4. กด **Deploy** รอประมาณ 1-2 นาที

เสร็จแล้วจะได้ URL แบบ `https://debt-tracker-xxxx.vercel.app` ที่ใครก็เปิดได้จากทุกที่ทุกอุปกรณ์ ส่งลิงก์นี้ให้ทีมใช้งานร่วมกันได้เลย

## การใช้งานต่อจากนี้

ทุกครั้งที่แก้ไขโค้ดแล้ว push ขึ้น GitHub อีกครั้ง Vercel จะ deploy เวอร์ชันใหม่ให้อัตโนมัติ
