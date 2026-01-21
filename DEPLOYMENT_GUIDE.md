# Production Deployment Guide - Button Text Customization Fix

## Issue
The kiosk page (https://kiosk.hio.ai.kr/kiosk) was serving cached content and not loading button texts from the database.

## Solution Applied
1. ✅ Fixed database encoding (Korean text now correct)
2. ✅ Added cache-busting directives to kiosk page:
   - `export const dynamic = 'force-dynamic'`
   - `export const revalidate = 0`
   - `export const fetchCache = 'force-no-store'`
3. ✅ Built application successfully

## Deployment Steps

### Method 1: SSH Deployment (Most Common)

```bash
# 1. SSH into your server
ssh user@54.180.144.32

# 2. Navigate to the kiosk admin directory
cd /path/to/hio-checkin-kiosk/admin

# 3. Pull latest code from Git
git pull origin main

# 4. Install dependencies (if package.json changed)
npm install --production

# 5. Build the application
npm run build

# 6. Restart the PM2 process
pm2 restart kiosk-admin
# OR if you don't use PM2:
# npm run start

# 7. Check PM2 status
pm2 status
pm2 logs kiosk-admin --lines 50
```

### Method 2: Docker Deployment

```bash
# 1. Build new Docker image
docker build -t kiosk-admin:latest .

# 2. Stop and remove old container
docker stop kiosk-admin
docker rm kiosk-admin

# 3. Run new container
docker run -d --name kiosk-admin \
  -p 3000:3000 \
  --env-file .env.production \
  kiosk-admin:latest

# 4. Check logs
docker logs -f kiosk-admin
```

### Method 3: Manual File Upload (If no Git)

```powershell
# On your local machine:
cd D:\Github\Hotel\hio-checkin-kiosk\admin

# 1. Create deployment package
tar -czf kiosk-deploy.tar.gz .next package.json package-lock.json

# 2. Upload to server using SCP
scp kiosk-deploy.tar.gz user@54.180.144.32:/path/to/app/

# 3. SSH into server and extract
ssh user@54.180.144.32
cd /path/to/app
tar -xzf kiosk-deploy.tar.gz
npm install --production
pm2 restart kiosk-admin
```

## Verification After Deployment

### 1. Clear Server Cache
```bash
# If using Next.js standalone
rm -rf /path/to/app/.next/cache

# Restart the application
pm2 restart kiosk-admin
```

### 2. Clear Browser Cache
- Open https://kiosk.hio.ai.kr/kiosk
- Press `Ctrl + Shift + Delete` (or `Cmd + Shift + Delete` on Mac)
- Select "Cached images and files"
- Clear cache
- Hard refresh: `Ctrl + F5` (or `Cmd + Shift + R` on Mac)

### 3. Test the Fix

#### A. Check Database Content
```bash
PGPASSWORD='00oo00oo' psql -h 54.180.144.32 -U orange -d kiosk -c \
  "SELECT content_key, content_value FROM kiosk_content 
   WHERE content_key IN ('btn_next', 'btn_checkin', 'btn_walkin') 
   LIMIT 3;"
```

Expected output:
```
  content_key   |  content_value
----------------+------------------
 btn_next       | 다음
 btn_checkin    | 예약 확인
 btn_walkin     | 현장예약
```

#### B. Test Admin Panel
1. Go to: https://kiosk.hio.ai.kr/dashboard/content
2. Change "btn_checkin" from "예약 확인" to "체크인 시작"
3. Click Save
4. Refresh kiosk page

#### C. Test Kiosk Page
1. Go to: https://kiosk.hio.ai.kr/kiosk
2. You should see:
   - "예약 확인" button (or your custom text)
   - "현장예약" button
   - "체크아웃" button
3. Verify buttons are NOT showing hardcoded text

### 4. Check Application Logs
```bash
# View PM2 logs
pm2 logs kiosk-admin --lines 100

# Look for:
# - No error messages
# - Successful database queries
# - Proper content loading
```

## Troubleshooting

### Issue: Buttons still show old text
**Solution:**
```bash
# 1. Clear Next.js cache
rm -rf /path/to/app/.next/cache/*

# 2. Restart with fresh build
pm2 stop kiosk-admin
npm run build
pm2 start kiosk-admin

# 3. Clear browser cache completely
# - Clear all cookies for kiosk.hio.ai.kr
# - Use incognito/private window to test
```

### Issue: 502 Bad Gateway
**Solution:**
```bash
# Check if app is running
pm2 status

# Check logs for errors
pm2 logs kiosk-admin --err

# Restart
pm2 restart kiosk-admin
```

### Issue: Database connection error
**Solution:**
```bash
# Test database connection
PGPASSWORD='00oo00oo' psql -h 54.180.144.32 -U orange -d kiosk -c "SELECT 1;"

# Check .env.production has correct DATABASE_URL
cat .env.production | grep DATABASE_URL
```

## Files Changed

1. `admin/src/app/(kiosk)/kiosk/page.tsx` - Added cache-busting
2. `admin/src/app/(kiosk)/kiosk/KioskApp.tsx` - Button texts use `t()` function
3. `admin/src/app/(dashboard)/dashboard/content/ContentEditor.tsx` - Added button text fields
4. `database/fix_button_texts_encoding.sql` - Fixed Korean encoding in production DB

## Rollback Plan (If Issues Occur)

```bash
# 1. Revert to previous commit
git log --oneline -5  # Find previous commit hash
git checkout <previous-commit-hash>

# 2. Rebuild
npm run build

# 3. Restart
pm2 restart kiosk-admin
```

## Success Criteria

✅ Kiosk page loads without errors
✅ Buttons show text from database (not hardcoded)
✅ Admin can edit button texts in /dashboard/content
✅ Changes in admin panel reflect immediately on kiosk page
✅ All Korean text displays correctly (no garbled characters)

---

**Note:** If you don't have SSH access, contact your hosting provider or DevOps team to deploy these changes.
