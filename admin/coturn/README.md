# Coturn TURN Server Setup

This directory contains the configuration for the coturn TURN server, which improves WebRTC voice call reliability.

## What is TURN?

**TURN (Traversal Using Relays around NAT)** is a protocol that relays media traffic when direct peer-to-peer connections fail. This is essential for:

- Corporate firewalls and restrictive NAT
- Symmetric NAT environments
- Mobile networks with strict NAT
- Hotel/public WiFi networks

**With STUN only:** ~80-90% call success rate
**With TURN:** ~100% call success rate

## Quick Start

### 1. Configure TURN Credentials

Edit `turnserver.conf` and change these critical settings:

```conf
# Change realm to your domain
realm=kiosk.hio.ai.kr

# IMPORTANT: Change default credentials!
user=YOUR_SECURE_USERNAME:YOUR_SECURE_PASSWORD
```

### 2. Set Public IP (Production Only)

For production deployments, uncomment and set your server's public IP:

```conf
external-ip=YOUR_PUBLIC_IP_HERE
```

To find your public IP:
```bash
curl ifconfig.me
```

### 3. Update Environment Variables

Edit `.env` in the admin directory:

```env
# For Docker deployment
NEXT_PUBLIC_TURN_SERVER_URL=turn:coturn:3478

# For production with public IP
# NEXT_PUBLIC_TURN_SERVER_URL=turn:YOUR_PUBLIC_IP:3478

# Must match turnserver.conf credentials
NEXT_PUBLIC_TURN_SERVER_USERNAME=YOUR_SECURE_USERNAME
NEXT_PUBLIC_TURN_SERVER_CREDENTIAL=YOUR_SECURE_PASSWORD
```

### 4. Start Services

```bash
cd /path/to/admin
docker-compose up -d
```

### 5. Verify TURN Server

Check if coturn is running:
```bash
docker logs hio-coturn
```

Test TURN connectivity:
```bash
docker exec hio-coturn turnutils_uclient -v -u YOUR_USERNAME -w YOUR_PASSWORD localhost
```

## Firewall Configuration

**Required ports:**

| Port Range | Protocol | Purpose |
|------------|----------|---------|
| 3478 | UDP/TCP | STUN/TURN |
| 5349 | UDP/TCP | STUN/TURN over TLS (optional) |
| 49152-65535 | UDP | TURN relay ports |

**Configure your firewall:**

```bash
# UFW (Ubuntu)
sudo ufw allow 3478/udp
sudo ufw allow 3478/tcp
sudo ufw allow 49152:65535/udp

# firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-port=3478/udp
sudo firewall-cmd --permanent --add-port=3478/tcp
sudo firewall-cmd --permanent --add-port=49152-65535/udp
sudo firewall-cmd --reload
```

## Security Best Practices

### 1. Change Default Credentials
Never use the default `turnuser:turnpassword` in production!

Generate secure credentials:
```bash
# Generate random username
openssl rand -hex 8

# Generate random password
openssl rand -base64 32
```

### 2. Enable TLS (Recommended for Production)

Add SSL certificate to `turnserver.conf`:
```conf
cert=/etc/coturn/turn_server_cert.pem
pkey=/etc/coturn/turn_server_pkey.pem
```

Then use `turns:` protocol in `.env`:
```env
NEXT_PUBLIC_TURN_SERVER_URL=turns:YOUR_DOMAIN:5349
```

### 3. Rate Limiting

Add to `turnserver.conf`:
```conf
# Limit bandwidth per user (1 Mbps)
max-bps=1000000

# Max concurrent users
total-quota=100
```

### 4. IP Whitelisting (Optional)

Restrict TURN access to specific IP ranges:
```conf
allowed-peer-ip=10.0.0.0-10.255.255.255
allowed-peer-ip=YOUR_KIOSK_IP
```

## Monitoring

### Check Logs
```bash
# Container logs
docker logs -f hio-coturn

# Inside container
docker exec hio-coturn tail -f /var/log/coturn/turnserver.log
```

### Monitor Resources
```bash
docker stats hio-coturn
```

### Enable Prometheus (Optional)

Add to `turnserver.conf`:
```conf
prometheus
```

Then scrape metrics from: `http://coturn:9641/metrics`

## Troubleshooting

### Calls Still Failing?

1. **Check TURN logs:**
   ```bash
   docker logs hio-coturn
   ```

2. **Verify credentials:**
   Ensure `.env` matches `turnserver.conf`

3. **Test TURN connectivity:**
   ```bash
   docker exec hio-coturn turnutils_uclient -v -u YOUR_USER -w YOUR_PASS localhost
   ```

4. **Check firewall:**
   Ensure UDP ports 3478 and 49152-65535 are open

5. **Verify public IP:**
   In `turnserver.conf`, `external-ip` should be your public IP

### Common Issues

**Issue:** "ALLOCATION ERROR 437 (Allocation Quota Reached)"
**Solution:** Increase `total-quota` in `turnserver.conf`

**Issue:** "Authentication failed"
**Solution:** Verify username/password match in `.env` and `turnserver.conf`

**Issue:** "No connectivity"
**Solution:** Check firewall rules, ensure UDP ports are open

**Issue:** Docker network issues
**Solution:** Ensure both `app` and `coturn` are on same network:
```bash
docker network inspect app-network
```

## Performance Tuning

### For High Traffic

Add to `turnserver.conf`:
```conf
# Increase file descriptors
max-allocate-lifetime=600

# Optimize for high concurrency
proc-user=turnserver
proc-group=turnserver

# Enable multi-threading
proc-mtu=1500
```

### For Low Resources

```conf
# Reduce logging
simple-log

# Lower session lifetime
max-allocate-lifetime=300
channel-lifetime=300
```

## Cost Estimation

**Bandwidth usage per call:**
- Voice only: ~50-100 KB/s per participant
- 1-hour call: ~200-350 MB
- 100 simultaneous calls: ~5-10 GB/hour

**Server requirements:**
- Minimum: 1 CPU, 1GB RAM
- Recommended: 2 CPU, 2GB RAM
- For 100+ concurrent calls: 4 CPU, 4GB RAM

## Alternative TURN Providers

If you prefer not to self-host:

| Provider | Cost | Notes |
|----------|------|-------|
| **Twilio** | $0.0004/minute | Enterprise-grade, expensive |
| **Xirsys** | $10-50/month | Simple, good for SMBs |
| **Metered** | $0.004/GB | Pay-as-you-go |
| **Self-hosted coturn** | Server cost only | Full control, cheapest |

## Disabling TURN

To disable TURN and use STUN-only (80-90% success rate):

1. Comment out TURN variables in `.env`:
   ```env
   # NEXT_PUBLIC_TURN_SERVER_URL=
   # NEXT_PUBLIC_TURN_SERVER_USERNAME=
   # NEXT_PUBLIC_TURN_SERVER_CREDENTIAL=
   ```

2. Stop coturn container:
   ```bash
   docker-compose stop coturn
   ```

The system will automatically fall back to STUN-only mode.

## Additional Resources

- [Coturn GitHub](https://github.com/coturn/coturn)
- [Coturn Wiki](https://github.com/coturn/coturn/wiki)
- [WebRTC TURN Guide](https://webrtc.org/getting-started/turn-server)
- [Test TURN Server](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)

## Support

For issues specific to this implementation, check Docker logs:
```bash
docker logs hio-coturn
docker logs hio-checkin-admin
```
