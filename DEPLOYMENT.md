# ExcelFlow AI - Production Deployment Guide

## 🚀 Complete Setup Instructions

### 📋 Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- **Git**
- **PostgreSQL** (for production)
- **Ubuntu 20.04+** server (DigitalOcean droplet)

---

## 🖥️ Local Development Setup (Windows)

### 1. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd excelflow-ai

# Install frontend dependencies
npm install

# Install backend dependencies
npm run server:install
```

### 2. Environment Configuration

```bash
# Copy environment files
cp .env.example .env
cp server/.env.example server/.env

# Edit server/.env with your settings
```

**server/.env** (Development):
```env
NODE_ENV=development
PORT=8000
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
DB_TYPE=sqlite
LOG_LEVEL=info
```

### 3. Database Setup

```bash
# Initialize database (SQLite for development)
npm run server:migrate

# Seed with sample data (optional)
npm run server:seed
```

### 4. Start Development

```bash
# Start both frontend and backend
npm run dev:full

# Or start separately:
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend  
npm run server:dev
```

**Access Points:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Health Check: http://localhost:8000/health

### 5. Test Accounts

- **Demo User**: demo@excelflow.ai / demo123
- **Product Owner**: owner@excelflow.ai / owner123!

---

## 🌐 Production Deployment (Ubuntu/DigitalOcean)

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Install Nginx
sudo apt install nginx -y

# Install PM2 for process management
sudo npm install -g pm2

# Install certbot for SSL
sudo apt install certbot python3-certbot-nginx -y
```

### 2. PostgreSQL Setup

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE excelflow_ai;
CREATE USER excelflow_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE excelflow_ai TO excelflow_user;
\q

# Configure PostgreSQL
sudo nano /etc/postgresql/14/main/postgresql.conf
# Uncomment and set: listen_addresses = 'localhost'

sudo nano /etc/postgresql/14/main/pg_hba.conf
# Add: local   excelflow_ai    excelflow_user                  md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### 3. Application Deployment

```bash
# Create application directory
sudo mkdir -p /var/www/excelflow-ai
sudo chown $USER:$USER /var/www/excelflow-ai

# Clone repository
cd /var/www/excelflow-ai
git clone <your-repo-url> .

# Install dependencies
npm install
npm run server:install

# Build frontend
npm run build
```

### 4. Environment Configuration

**server/.env** (Production):
```env
NODE_ENV=production
PORT=8000
JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters-production

# Database
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=excelflow_ai
DB_USER=excelflow_user
DB_PASSWORD=your_secure_password

# Security
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# File uploads
MAX_FILE_SIZE=104857600

# Logging
LOG_LEVEL=info

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@yourdomain.com
```

### 5. Database Migration

```bash
# Run database migrations
cd /var/www/excelflow-ai
npm run server:migrate
```

### 6. PM2 Process Management

Create **ecosystem.config.js**:
```javascript
module.exports = {
  apps: [{
    name: 'excelflow-ai',
    script: './server/src/server.js',
    cwd: '/var/www/excelflow-ai',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 8000
    },
    error_file: '/var/log/excelflow-ai/error.log',
    out_file: '/var/log/excelflow-ai/out.log',
    log_file: '/var/log/excelflow-ai/combined.log',
    time: true
  }]
};
```

```bash
# Create log directory
sudo mkdir -p /var/log/excelflow-ai
sudo chown $USER:$USER /var/log/excelflow-ai

# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup

# Monitor
pm2 status
pm2 logs excelflow-ai
```

### 7. Nginx Configuration

Create **/etc/nginx/sites-available/excelflow-ai**:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript;

    # API routes
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location / {
        root /var/www/excelflow-ai/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # File upload size
    client_max_body_size 100M;
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/excelflow-ai /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### 8. SSL Certificate

```bash
# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 9. Firewall Setup

```bash
# Configure UFW
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Check status
sudo ufw status
```

### 10. Monitoring & Maintenance

```bash
# System monitoring
sudo apt install htop iotop -y

# Log rotation
sudo nano /etc/logrotate.d/excelflow-ai
```

**/etc/logrotate.d/excelflow-ai**:
```
/var/log/excelflow-ai/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reload excelflow-ai
    endscript
}
```

---

## 🔄 Database Migration Guide

### SQLite to PostgreSQL Migration

1. **Export SQLite data**:
```bash
# On development machine
sqlite3 server/data/development.db .dump > backup.sql
```

2. **Clean and import to PostgreSQL**:
```bash
# Clean the dump file for PostgreSQL compatibility
sed -i 's/AUTOINCREMENT/SERIAL/g' backup.sql
sed -i 's/INTEGER PRIMARY KEY/SERIAL PRIMARY KEY/g' backup.sql

# Import to PostgreSQL
psql -U excelflow_user -d excelflow_ai -f backup.sql
```

3. **Update environment**:
```bash
# Change DB_TYPE in server/.env
DB_TYPE=postgres
```

---

## 📊 Performance Optimization

### 1. Database Optimization

```sql
-- Add indexes for better performance
CREATE INDEX CONCURRENTLY idx_analytics_user_event ON analytics(user_id, event);
CREATE INDEX CONCURRENTLY idx_files_user_status ON files(user_id, status);
CREATE INDEX CONCURRENTLY idx_workflows_user_status ON workflows(user_id, status);
```

### 2. Application Optimization

```bash
# Enable Node.js clustering
# Already configured in ecosystem.config.js

# Optimize PM2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### 3. Nginx Optimization

Add to nginx configuration:
```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req zone=api burst=20 nodelay;

# Connection limits
limit_conn_zone $binary_remote_addr zone=conn_limit_per_ip:10m;
limit_conn conn_limit_per_ip 20;
```

---

## 🔒 Security Checklist

- [ ] Strong JWT secret (32+ characters)
- [ ] PostgreSQL with restricted access
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Regular security updates
- [ ] Log monitoring
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] File upload restrictions
- [ ] Environment variables secured

---

## 📈 Monitoring & Alerts

### 1. Application Monitoring

```bash
# PM2 monitoring
pm2 install pm2-server-monit

# System monitoring
sudo apt install netdata -y
```

### 2. Log Monitoring

```bash
# Real-time log monitoring
pm2 logs excelflow-ai --lines 100

# Error tracking
tail -f /var/log/excelflow-ai/error.log
```

### 3. Health Checks

Set up external monitoring for:
- https://yourdomain.com/health
- Application uptime
- Database connectivity
- SSL certificate expiry

---

## 🚨 Troubleshooting

### Common Issues

1. **Port 8000 already in use**:
```bash
sudo lsof -i :8000
sudo kill -9 <PID>
```

2. **Database connection failed**:
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection
psql -U excelflow_user -d excelflow_ai -h localhost
```

3. **PM2 process crashed**:
```bash
pm2 restart excelflow-ai
pm2 logs excelflow-ai --err
```

4. **Nginx configuration error**:
```bash
sudo nginx -t
sudo systemctl status nginx
```

5. **SSL certificate issues**:
```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

---

## 📞 Support

For production deployment support:
- Check logs: `/var/log/excelflow-ai/`
- Monitor processes: `pm2 status`
- Database status: `sudo systemctl status postgresql`
- Web server status: `sudo systemctl status nginx`

This deployment guide ensures a production-ready, scalable, and secure ExcelFlow AI application.