# Domain Setup

Configure a custom domain for your Briefcast podcast RSS feed.

## Prerequisites

- A registered domain name
- Access to domain DNS settings
- Cloudflare account with your domain added

## Adding Domain to Cloudflare

1. **Add Site to Cloudflare**
   ```bash
   # Log in to Cloudflare dashboard
   # Click "Add a Site"
   # Enter your domain name
   # Select Free plan (or preferred plan)
   ```

2. **Update Nameservers**
   - Cloudflare will provide two nameservers
   - Update your domain registrar's nameserver settings
   - Wait for DNS propagation (usually 24-48 hours)

3. **Verify Domain**
   - Check that your domain is active in Cloudflare dashboard
   - Status should show "Active"

## Configure Email Routing

1. **Enable Email Routing**
   ```bash
   # In Cloudflare dashboard:
   # Go to Email > Email Routing
   # Click "Get Started"
   # Click "Enable Email Routing"
   ```

2. **Add Destination Address**
   - Add your personal email as destination
   - Verify the email address

3. **Create Routing Rule**
   ```bash
   # Custom address: newsletters@yourdomain.com
   # Action: Send to your verified destination
   ```

4. **Update DNS Records**
   - Cloudflare automatically adds MX records
   - Verify MX records are present in DNS settings

## Configure Workers Route

1. **Add Workers Route**
   ```bash
   wrangler deploy
   # This creates a *.workers.dev route
   ```

2. **Add Custom Domain (Optional)**
   ```bash
   # In Cloudflare dashboard:
   # Go to Workers & Pages > Your worker
   # Click "Triggers" tab
   # Add custom domain: podcast.yourdomain.com
   ```

## Configure R2 Custom Domain

1. **Add R2 Custom Domain**
   ```bash
   # In Cloudflare dashboard:
   # Go to R2 > Your bucket
   # Click "Settings"
   # Add custom domain: cdn.yourdomain.com
   ```

2. **Update Config**
   ```yaml
   podcast:
     base_url: "https://cdn.yourdomain.com"
   ```

## Testing

1. **Test Email Delivery**
   ```bash
   # Send test email to newsletters@yourdomain.com
   # Check Cloudflare Email Routing logs
   ```

2. **Test RSS Feed**
   ```bash
   curl https://cdn.yourdomain.com/feed.xml
   ```

3. **Test API Endpoints**
   ```bash
   curl -H "Authorization: Bearer your-token" \
        https://podcast.yourdomain.com/trigger
   ```

## Troubleshooting

**Email not delivered**
- Check MX records in DNS
- Verify Email Routing is enabled
- Check spam folder

**RSS feed not accessible**
- Verify R2 bucket is public
- Check custom domain DNS settings
- Confirm base_url in config.yaml

**Workers not responding**
- Check Workers route configuration
- Verify deployment was successful
- Check Workers logs for errors
