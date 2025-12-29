# HTTPS Setup for Network Access

This guide shows how to enable HTTPS so the kiosk can access camera/microphone over the network.

## Quick Setup (Windows)

### 1. Install mkcert

Download from: https://github.com/FiloSottile/mkcert/releases

Or use Chocolatey:
```powershell
choco install mkcert
```

### 2. Create SSL Certificates

```powershell
# Navigate to admin folder
cd D:\Github\hio-checkin-kiosk\admin

# Create certs directory
mkdir certs
cd certs

# Install local CA
mkcert -install

# Generate certificates for your network
# Replace 192.168.1.50 with your actual laptop IP
mkcert localhost 127.0.0.1 ::1 192.168.1.* *.local

# Rename the generated files
# Look for files like: localhost+4.pem and localhost+4-key.pem
# Rename to: localhost.pem and localhost-key.pem
ren "localhost+*-key.pem" localhost-key.pem
ren "localhost+*.pem" localhost.pem
```

### 3. Start Server with HTTPS

```powershell
# Stop the current server (Ctrl+C)

# Start with HTTPS
npm run dev:https
```

You should see:
```
> Ready on https://localhost:3000
> Also accessible at https://192.168.1.* (your network IP)
✅ HTTPS enabled - Camera/microphone will work over network!
```

### 4. Access from Any Device

**From laptop (server):**
```
https://localhost:3000/kiosk
```

**From other PC on network:**
```
https://192.168.1.50:3000/kiosk
(Replace 192.168.1.50 with your laptop's actual IP)
```

**First time:** Browser will ask you to allow the self-signed certificate. Click "Advanced" → "Proceed to localhost" (or similar).

## Troubleshooting

### Certificate Warning in Browser
This is normal for self-signed certificates. Click "Advanced" → "Continue to site"

### Find Your IP Address
```powershell
ipconfig
# Look for IPv4 Address under your active network adapter
```

### Port Already in Use
```powershell
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual number)
taskkill /PID <PID> /F
```

### Certificates Not Found
Make sure files are named exactly:
- `localhost-key.pem`
- `localhost.pem`

Located in: `D:\Github\hio-checkin-kiosk\admin\certs\`

## Production Deployment

For production, use proper SSL certificates from:
- Let's Encrypt (free)
- Your domain registrar
- Cloud provider SSL service

Never use self-signed certificates in production!

## Reverting to HTTP

If you want to go back to HTTP only:

```powershell
npm run dev
```

The custom server (`server.js`) will automatically use HTTP if certificates aren't found.
