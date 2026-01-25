# Troubleshooting - Kiosk System

Common issues and solutions for Hotel Check-in Kiosk deployment and operation.

## Table of Contents

1. [Database Issues](#database-issues)
2. [Application Issues](#application-issues)
3. [Integration Issues](#integration-issues)
4. [Hardware Issues](#hardware-issues)
5. [Video Call Issues](#video-call-issues)
6. [Performance Issues](#performance-issues)
7. [Deployment Issues](#deployment-issues)
8. [Getting Help](#getting-help)

---

## Database Issues

### Cannot Connect to PostgreSQL

**Error**:
```
could not connect to server: Connection refused
	Is the server running on host "localhost" and accepting TCP/IP connections on port 5432?
```

**Solutions**:

1. **Check if PostgreSQL is running**:
   ```powershell
   # Windows
   Get-Service -Name postgresql*

   # Linux/macOS
   sudo systemctl status postgresql
   ```

2. **Start PostgreSQL**:
   ```powershell
   # Windows
   net start postgresql-x64-16

   # Linux/macOS
   sudo systemctl start postgresql
   ```

3. **Verify credentials in `.env`**:
   ```env
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_DATABASE=kiosk
   POSTGRES_USER=orange
   POSTGRES_PASSWORD=00oo00oo
   ```

4. **Test connection manually**:
   ```powershell
   psql -h localhost -p 5432 -U orange -d kiosk
   ```

---

### Password Authentication Failed

**Error**:
```
FATAL: password authentication failed for user "orange"
```

**Solutions**:

1. **Verify password in `.env` matches database**:
   ```env
   POSTGRES_PASSWORD=00oo00oo
   ```

2. **Reset database user password**:
   ```sql
   psql -U postgres
   ALTER USER orange WITH PASSWORD '00oo00oo';
   \q
   ```

3. **Check PostgreSQL authentication config** (`pg_hba.conf`):
   ```
   # Should have:
   local   all   all   md5
   host    all   all   127.0.0.1/32   md5
   ```

---

### Database Does Not Exist

**Error**:
```
FATAL: database "kiosk" does not exist
```

**Solution**:
```sql
psql -U postgres
CREATE DATABASE kiosk OWNER orange;
GRANT ALL PRIVILEGES ON DATABASE kiosk TO orange;
\q
```

Then apply schema:
```powershell
psql -U orange -d kiosk -f database/schema.sql
```

---

### Schema Not Applied

**Error**: `relation "users" does not exist`

**Cause**: Database schema not applied.

**Solution**:
```powershell
cd d:\GitHub\Hotel\hio-checkin-kiosk
psql -U orange -d kiosk -f database/schema.sql

# Verify tables created
psql -U orange -d kiosk -c "\dt"
```

**Expected Output**: 13 tables created (users, profiles, projects, kiosks, rooms, etc.)

---

## Application Issues

### Port Already in Use

**Error**:
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions**:

1. **Find and kill process using port 3000**:
   ```powershell
   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F

   # Linux/macOS
   lsof -ti:3000 | xargs kill -9
   ```

2. **Use a different port**:
   ```powershell
   npm run dev -- -p 3001
   ```

3. **Update `.env`**:
   ```env
   NEXT_PUBLIC_APP_URL=http://localhost:3001
   ```

---

### npm install Errors

**Error**: `ERESOLVE unable to resolve dependency tree`

**Solutions**:
```powershell
# Option 1: Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Option 2: Force install
npm install --force

# Option 3: Use legacy peer deps
npm install --legacy-peer-deps
```

**Error**: `ENOENT: no such file or directory, open '.../package.json'`

**Solution**: Ensure you're in the correct directory:
```powershell
cd d:\GitHub\Hotel\hio-checkin-kiosk\admin
npm install
```

---

### Missing Environment Variable

**Error**: `Cannot read property 'X' of undefined`

**Solution**: Ensure `admin/.env` exists with all required variables.

```powershell
# Check if file exists
ls admin/.env

# Create if missing
cp admin/.env.example admin/.env

# Or create manually
New-Item -Path "admin/.env" -ItemType File
```

**Verify all required variables** are set:
- POSTGRES_HOST
- POSTGRES_PORT
- POSTGRES_DATABASE
- POSTGRES_USER
- POSTGRES_PASSWORD
- JWT_SECRET
- NEXT_PUBLIC_APP_URL
- PMS_AUTH_URL

---

### Build Errors

**Error**: `TypeScript error in src/...`

**Solution**:
```powershell
# Run type checker
npm run type-check

# Fix type errors in reported files
```

**Error**: `Cannot find module '@/...'`

**Cause**: Path alias not configured.

**Solution**: Check `tsconfig.json` has path alias:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

---

## Integration Issues

### PMS Authentication Not Working

**Error**: `Cannot connect to PMS` or `Authentication failed`

**Solutions**:

1. **Verify HotelPMS is running**:
   ```powershell
   curl http://localhost:8000/docs
   # Should return Swagger UI
   ```

2. **Check `PMS_AUTH_URL` in `.env`**:
   ```env
   PMS_AUTH_URL=http://localhost:8000
   ```

3. **Verify user has kiosk access in PMS**:
   ```sql
   # In PMS database
   SELECT email, allowed_systems FROM users WHERE email = 'admin@pms.com';

   # Should include 'kiosk' in allowed_systems
   # If not, update:
   UPDATE users SET allowed_systems = ARRAY['pms', 'kiosk'] WHERE email = 'admin@pms.com';
   ```

4. **Check CORS configuration in PMS**:
   ```env
   # In PMS backend/.env
   BACKEND_CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]
   ```

---

### useB API Errors

**Error**: `useB authentication failed` or `Invalid credentials`

**Solutions**:

1. **Verify useB credentials in `.env`**:
   ```env
   USEB_EMAIL=test_stayg.dev@gmail.com
   USEB_PASSWORD="stayg.dev251215!@#"
   ```

2. **Test useB login manually**:
   ```powershell
   curl -X POST https://api.useb.co.kr/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test_stayg.dev@gmail.com","password":"stayg.dev251215!@#"}'
   ```

3. **Check useB account status**:
   - Login to https://useb.co.kr
   - Verify account is active
   - Check API quota/limits

4. **Ensure password is quoted**:
   ```env
   # Correct (with quotes)
   USEB_PASSWORD="stayg.dev251215!@#"

   # Wrong (no quotes)
   USEB_PASSWORD=stayg.dev251215!@#
   ```

---

### useB Face Authentication Fails

**Error**: `Face authentication failed` or `Invalid client credentials`

**Solutions**:

1. **Verify face API credentials**:
   ```env
   FACE_CLIENT_ID=6tm6s6pts8lo3tks5lksjpbb5h
   FACE_CLIENT_SECRET=1tddlv9krucj399s4njr6kc57th2ithi9bubj2r5hoa3u0olbq2m
   ```

2. **Test OAuth token generation**:
   ```powershell
   curl -X POST https://face.useb.co.kr/oauth/token \
     -d "client_id=6tm6s6pts8lo3tks5lksjpbb5h" \
     -d "client_secret=1tddlv9krucj399s4njr6kc57th2ithi9bubj2r5hoa3u0olbq2m" \
     -d "grant_type=client_credentials"
   ```

3. **Check camera permissions**:
   - Browser must have camera access
   - Test webcam with other apps

4. **Check lighting**:
   - Ensure adequate front lighting
   - Avoid backlighting
   - Test with different lighting conditions

---

### VTR Payment Terminal Not Working

**Error**: `Payment terminal not responding` or `Cannot connect to payment server`

**Solutions**:

1. **Verify VtrRestServer is running**:
   ```powershell
   curl http://localhost:8085/status
   # Should return: {"status":"ready","terminal_connected":true}
   ```

2. **Check `PAYMENT_AGENT_URL` in `.env`**:
   ```env
   NEXT_PUBLIC_PAYMENT_AGENT_URL=http://localhost:8085
   ```

3. **Restart VtrRestServer**:
   ```powershell
   # Windows
   taskkill /IM VtrRestServer.exe /F
   VtrRestServer.exe --port 8085 --com COM3

   # Or via systemd (Linux)
   sudo systemctl restart vtr-payment
   ```

4. **Check COM port configuration**:
   - Verify VTR terminal is connected (USB/Serial)
   - Check Device Manager (Windows) for COM port number
   - Update VtrRestServer config with correct COM port

5. **Test terminal connection**:
   ```powershell
   # Send test transaction
   curl -X POST http://localhost:8085/payment \
     -H "Content-Type: application/json" \
     -d '{"amount":100,"currency":"KRW","transaction_id":"test_001"}'
   ```

---

## Hardware Issues

### ID Card Scanner Not Working

**Symptoms**: ID card not detected, scanning fails

**Solutions**:

1. **Check scanner connection**:
   - Verify USB cable is connected
   - Check Device Manager (Windows) for scanner device
   - Try different USB port

2. **Restart scanner driver**:
   - Unplug scanner
   - Wait 10 seconds
   - Plug back in

3. **Test scanner with manufacturer software**:
   - Use scanner's test utility
   - Verify scanner hardware is functioning

4. **Fallback to manual entry**:
   - Use "Manual Entry" button in kiosk
   - Staff verification required

5. **Check scanner settings**:
   - Verify scanner is in ID card mode (not barcode mode)
   - Check resolution settings (minimum 600 DPI)

---

### Touchscreen Not Responding

**Symptoms**: Touch inputs not registered

**Solutions**:

1. **Calibrate touchscreen**:
   - Windows Settings → Devices → Pen & Windows Ink → Calibrate
   - Follow on-screen instructions

2. **Check touchscreen driver**:
   - Device Manager → Human Interface Devices
   - Update/reinstall touchscreen driver

3. **Restart kiosk device**:
   ```powershell
   shutdown /r /t 0
   ```

4. **Check USB connection** (for USB touchscreens):
   - Reconnect USB cable
   - Try different USB port

5. **Test with mouse** (temporary workaround):
   - Connect USB mouse for testing
   - Verify clicks work

---

### Webcam Not Working (Video Call)

**Symptoms**: Black screen, camera not found

**Solutions**:

1. **Check browser permissions**:
   - Allow camera access in browser
   - Chrome: Settings → Privacy → Camera
   - Check for blocked permissions icon in address bar

2. **Test webcam with other apps**:
   - Windows Camera app
   - Verify webcam works outside kiosk

3. **Check webcam connection**:
   - Verify USB cable connected
   - Try different USB port
   - Check Device Manager for webcam

4. **Restart browser/kiosk**:
   - Close all browser windows
   - Clear browser cache
   - Restart kiosk app

5. **HTTPS requirement**:
   - WebRTC requires HTTPS in production
   - Use `localhost` for development (exempt from HTTPS)

---

### Printer Not Working

**Symptoms**: Receipt not printing

**Solutions**:

1. **Check printer connection**:
   - Verify USB/serial connection
   - Check power supply

2. **Check printer driver**:
   - Device Manager → Printers
   - Update/reinstall printer driver

3. **Test print job**:
   ```powershell
   # Windows test page
   notepad > Print > [Select Printer] > Print Test Page
   ```

4. **Check paper**:
   - Ensure paper is loaded
   - Check for paper jam

5. **Restart printer**:
   - Power off printer
   - Wait 30 seconds
   - Power on

---

## Video Call Issues

### Video Call Not Connecting

**Symptoms**: Call initiated but no connection established

**Solutions**:

1. **Check WebRTC requirements**:
   - HTTPS required in production
   - Browser must support WebRTC (Chrome, Firefox, Edge)
   - Camera/microphone permissions granted

2. **Verify admin dashboard is running**:
   - Admin must be logged in to receive calls
   - Check notification permissions in browser

3. **Check network connectivity**:
   - Both kiosk and admin must have internet access
   - Firewall may block WebRTC ports
   - Try disabling firewall temporarily (testing only)

4. **Clear signaling messages**:
   ```sql
   -- In kiosk database
   DELETE FROM signaling_messages WHERE created_at < NOW() - INTERVAL '1 hour';
   ```

5. **Restart both kiosk and admin dashboard**

---

### Video Call Poor Quality

**Symptoms**: Laggy video, audio cutting out

**Solutions**:

1. **Check network bandwidth**:
   - Minimum 5 Mbps for video calls
   - Test with speedtest.net
   - Close other bandwidth-heavy apps

2. **Reduce video quality** (if configurable):
   - Lower resolution (720p → 480p)
   - Reduce frame rate (30fps → 15fps)

3. **Audio-only fallback**:
   - Disable video, use audio only
   - Check audio quality improves

4. **Check CPU usage**:
   - High CPU can cause lag
   - Close unnecessary apps
   - Restart kiosk device

---

### Video Call Auto-Disconnects

**Symptoms**: Call drops after few seconds/minutes

**Solutions**:

1. **Check timeout settings**:
   - Default timeout: 10 minutes
   - Adjust if needed

2. **Network stability**:
   - Verify stable internet connection
   - Check for intermittent connectivity issues

3. **WebRTC connection state**:
   - Check browser console for WebRTC errors
   - Look for ICE connection failures

4. **Restart video session**:
   ```sql
   -- Clear stuck video sessions
   DELETE FROM video_sessions WHERE status = 'active' AND created_at < NOW() - INTERVAL '1 hour';
   ```

---

## Performance Issues

### Slow Application Startup

**Symptoms**: Application takes >30 seconds to start

**Solutions**:

1. **Check database connection**:
   - Slow DB connection can delay startup
   - Verify PostgreSQL is on same machine or fast network

2. **Clear Next.js cache**:
   ```powershell
   rm -rf .next
   npm run dev
   ```

3. **Reduce npm packages** (if custom builds):
   - Remove unused dependencies
   - Run `npm prune`

4. **Use production build** (faster than dev):
   ```powershell
   npm run build
   npm run start
   ```

---

### Slow Check-in Process

**Symptoms**: Each screen takes >5 seconds to load

**Solutions**:

1. **Check network latency**:
   - Test ping to PMS: `ping localhost`
   - Test ping to useB API: `ping api.useb.co.kr`

2. **Optimize database queries**:
   - Add indexes to frequently queried tables
   - Vacuum database:
     ```sql
     VACUUM ANALYZE;
     ```

3. **Enable caching** (if applicable):
   - Cache project/room data
   - Reduce database calls

4. **Check kiosk hardware**:
   - Minimum 4GB RAM
   - SSD storage (faster than HDD)
   - Close unnecessary background apps

---

### High Memory Usage

**Symptoms**: Kiosk using >2GB RAM

**Solutions**:

1. **Restart kiosk application**:
   ```powershell
   # Kill Node.js process
   taskkill /IM node.exe /F

   # Restart
   npm run start
   ```

2. **Clear browser cache** (if using browser kiosk mode):
   - Chrome: chrome://settings/clearBrowserData
   - Clear cached images and files

3. **Reduce polling frequency**:
   - Video call polling: 2s → 5s
   - Kiosk status polling: 10s → 30s

4. **Memory leak check**:
   - Monitor memory over time
   - Look for gradual increase
   - Report to developers if leak suspected

---

## Deployment Issues

### Production Build Fails

**Error**: `npm run build` fails

**Solutions**:

1. **Check for TypeScript errors**:
   ```powershell
   npm run type-check
   ```

2. **Check for linting errors**:
   ```powershell
   npm run lint
   ```

3. **Clear and rebuild**:
   ```powershell
   rm -rf .next node_modules
   npm install
   npm run build
   ```

4. **Check Node.js version**:
   ```powershell
   node --version
   # Should be 18+
   ```

---

### Environment Variables Not Loading (Production)

**Symptoms**: App uses default values instead of production values

**Solutions**:

1. **Verify `.env` file location**:
   - Must be in `admin/` directory
   - Not `admin/.env.local` or `admin/.env.development`

2. **Check file encoding**:
   - Must be UTF-8
   - No BOM (Byte Order Mark)

3. **Verify variable format**:
   ```env
   # Correct
   POSTGRES_HOST=localhost

   # Wrong (no spaces around =)
   POSTGRES_HOST = localhost
   ```

4. **Restart application** after changing `.env`

5. **Check NEXT_PUBLIC_ prefix** for client-side variables:
   ```env
   # Client-side (browser access)
   NEXT_PUBLIC_APP_URL=https://kiosk.hio.ai.kr

   # Server-side only
   POSTGRES_PASSWORD=secret
   ```

---

### HTTPS Issues (Production)

**Symptoms**: WebRTC not working in production

**Cause**: WebRTC requires HTTPS (except localhost)

**Solutions**:

1. **Enable HTTPS**:
   - Use reverse proxy (Nginx, Caddy)
   - Obtain SSL certificate (Let's Encrypt)

2. **Nginx HTTPS configuration**:
   ```nginx
   server {
       listen 443 ssl;
       server_name kiosk.hio.ai.kr;

       ssl_certificate /etc/letsencrypt/live/kiosk.hio.ai.kr/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/kiosk.hio.ai.kr/privkey.pem;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **Update `NEXT_PUBLIC_APP_URL`**:
   ```env
   NEXT_PUBLIC_APP_URL=https://kiosk.hio.ai.kr
   ```

---

## Getting Help

### Logs Location

**Application Logs**:
- Console output (stdout/stderr)
- Check for ERROR or WARNING messages
- PM2 logs (if using PM2): `pm2 logs`

**Browser Logs**:
- Press F12 → Console tab
- Check for errors (red text)
- Check Network tab for failed API calls

**PostgreSQL Logs**:
- Windows: `C:\Program Files\PostgreSQL\16\data\log\`
- Linux: `/var/log/postgresql/`

**Kiosk Device Logs** (if applicable):
- System event logs (Windows Event Viewer)
- Application crash dumps

---

### Debug Mode

**Enable verbose logging**:

1. **Next.js Debug Mode**:
   ```env
   NODE_ENV=development
   DEBUG=*
   ```

2. **Database Query Logging**:
   - Set PostgreSQL log level to DEBUG
   - Check slow queries in `pg_stat_statements`

3. **Browser DevTools**:
   - Network tab: Monitor API calls
   - Console tab: JavaScript errors
   - Application tab: Check cookies, localStorage

---

### Common Commands

**Reset Everything**:
```powershell
# Database
psql -U postgres -c "DROP DATABASE kiosk;"
psql -U postgres -c "CREATE DATABASE kiosk OWNER orange;"
psql -U orange -d kiosk -f database/schema.sql

# Application
cd admin
rm -rf node_modules .next
npm install
npm run dev
```

**Clear Cache**:
```powershell
# Browser cache: Ctrl+Shift+Delete
# npm cache:
npm cache clean --force

# Next.js cache:
rm -rf .next
```

**Update Dependencies**:
```powershell
npm update
npm audit fix
```

---

### Health Check

**Database**:
```powershell
psql -U orange -d kiosk -c "SELECT NOW();"
```

**Application**:
```powershell
curl http://localhost:3000
# Should return HTML or redirect
```

**PMS Integration**:
```powershell
curl http://localhost:8000/api/v1/health
# Should return {"status":"healthy"}
```

---

### Support Resources

- **Setup Guide**: [02-setup.md](02-setup.md)
- **Environment Variables**: [03-env.md](03-env.md)
- **Integration Guide**: [06-integrations.md](06-integrations.md)

---

### Reporting Issues

When reporting issues, include:

1. **Error Message**: Full error text
2. **Steps to Reproduce**: What you did before error
3. **Environment**:
   - OS (Windows/Linux/macOS)
   - Node.js version (`node --version`)
   - PostgreSQL version (`psql --version`)
4. **Logs**: Relevant log output
5. **Configuration**: Sanitized `.env` (remove secrets!)

---

## Quick Reference

| Issue | Quick Fix |
|-------|-----------|
| Can't connect to database | Start PostgreSQL service |
| Port 3000 in use | Kill process or use different port |
| PMS auth fails | Verify PMS is running, check allowed_systems |
| useB OCR fails | Verify credentials, check image quality |
| VTR payment fails | Restart VtrRestServer, check COM port |
| Video call not working | Check HTTPS, camera permissions |
| npm install fails | `npm cache clean --force && npm install` |
| Build fails | Clear .next folder, rebuild |

---

**Previous**: [← 08 - Deployment](08-deployment.md) | **Back to**: [README](../README.md)
