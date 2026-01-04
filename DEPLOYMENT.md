# Deployment Checklist

Complete this checklist before deploying Briefcast to production.

## Pre-Deployment

### Code Quality
- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] TypeScript compiles: `npm run build` (if applicable)
- [ ] No console.log statements in production code
- [ ] Error handling implemented for all API calls

### Configuration
- [ ] `config.yaml` created and reviewed
- [ ] All required fields populated in config.yaml
- [ ] Cron schedule verified (default: `0 5 * * *`)
- [ ] Podcast metadata updated (title, description, author)
- [ ] TTS voice and bitrate configured
- [ ] Email TTL and max episodes set appropriately

### Cloudflare Setup
- [ ] Wrangler CLI installed and logged in
- [ ] KV namespace created for EMAIL_STORE
- [ ] R2 bucket created for podcast storage
- [ ] Email routing enabled on domain
- [ ] Custom email address configured

### Secrets
- [ ] ANTHROPIC_API_KEY set: `wrangler secret put ANTHROPIC_API_KEY`
- [ ] FISH_AUDIO_API_KEY set: `wrangler secret put FISH_AUDIO_API_KEY`
- [ ] API_AUTH_TOKEN generated and set: `wrangler secret put API_AUTH_TOKEN`
- [ ] API token saved securely for future API calls

### Domain Configuration
- [ ] Domain added to Cloudflare
- [ ] MX records configured for email routing
- [ ] Custom domain for R2 bucket (optional)
- [ ] Custom domain for Worker (optional)

## Deployment

### Initial Deploy
- [ ] Run deployment script: `./scripts/deploy.sh`
- [ ] Or manually: `wrangler deploy`
- [ ] Note worker URL from deployment output
- [ ] Upload config.yaml to R2: `wrangler r2 object put briefcast-podcast/config.yaml --file=config.yaml`

### Verification
- [ ] Worker accessible at URL
- [ ] API endpoint responds: `curl https://your-worker.workers.dev/pending -H "Authorization: Bearer token"`
- [ ] Email routing active in Cloudflare dashboard
- [ ] R2 bucket contains config.yaml
- [ ] KV namespace visible in dashboard

## Post-Deployment Testing

### Email Ingestion
- [ ] Send test email to newsletters@yourdomain.com
- [ ] Verify email appears in KV: `wrangler kv:key list --namespace-id=your-id`
- [ ] Check worker logs: `wrangler tail`

### Manual Trigger
- [ ] Trigger manually: `./scripts/trigger.sh https://your-worker.workers.dev`
- [ ] Check for pending scripts: `curl https://your-worker.workers.dev/pending -H "Authorization: Bearer token"`
- [ ] Verify script generated correctly

### Script Approval
- [ ] Review pending script
- [ ] Approve script: `curl -X POST https://your-worker.workers.dev/approve/script-id -H "Authorization: Bearer token"`
- [ ] Verify audio file created in R2
- [ ] Check RSS feed updated: `curl https://pub-xxxxx.r2.dev/feed.xml`

### RSS Feed
- [ ] RSS feed accessible publicly
- [ ] Feed contains episode
- [ ] Audio file downloadable
- [ ] Subscribe in podcast app (Apple Podcasts, Overcast, etc.)
- [ ] Verify episode plays correctly

## Monitoring Setup

### Cloudflare Monitoring
- [ ] Worker metrics visible in dashboard
- [ ] Email routing logs accessible
- [ ] R2 usage metrics visible
- [ ] Error rate alerts configured (optional)

### External Monitoring
- [ ] Uptime monitoring configured (UptimeRobot, Pingdom, etc.)
- [ ] RSS feed monitored
- [ ] Alert notifications configured (email, Slack, etc.)

### Logging
- [ ] Worker logs accessible via `wrangler tail`
- [ ] Log level appropriate for production
- [ ] Structured logging working correctly
- [ ] PII sanitization verified

## Cost Monitoring

### Cloudflare
- [ ] Workers usage within expected range
- [ ] R2 storage costs tracked
- [ ] KV operations within free tier
- [ ] Billing alerts configured

### API Costs
- [ ] Anthropic API usage monitored
- [ ] Fish Audio credits tracked
- [ ] Budget alerts set for both APIs
- [ ] Monthly cost estimate verified

## Security

### Access Control
- [ ] API_AUTH_TOKEN strong and unique
- [ ] Token stored securely (not in git)
- [ ] API endpoints require authentication
- [ ] No secrets in code or config files

### API Keys
- [ ] Anthropic key has minimum required permissions
- [ ] Fish Audio key secured
- [ ] Keys rotated if compromised
- [ ] Separate keys for dev/staging/prod (if applicable)

## Documentation

### User Documentation
- [ ] README.md up to date
- [ ] Setup guides accurate
- [ ] API documentation complete
- [ ] Troubleshooting guide helpful

### Internal Documentation
- [ ] Architecture documented
- [ ] Deployment process documented
- [ ] Runbook created for common issues
- [ ] Contact information updated

## Rollback Plan

### Preparation
- [ ] Previous version tagged in git
- [ ] Rollback procedure documented
- [ ] Config backup stored
- [ ] Database/storage backup strategy defined (if applicable)

### Rollback Steps
1. Revert to previous git tag
2. Redeploy: `wrangler deploy`
3. Restore config.yaml from backup
4. Verify service operational
5. Communicate status to users (if applicable)

## Production Checklist

### Week 1
- [ ] Monitor worker metrics daily
- [ ] Check RSS feed daily
- [ ] Review error logs
- [ ] Verify cron jobs running
- [ ] Test manual trigger weekly

### Ongoing
- [ ] Review costs monthly
- [ ] Rotate API keys quarterly
- [ ] Update dependencies monthly
- [ ] Review and improve prompts
- [ ] Gather user feedback (if applicable)

## Emergency Contacts

- **Cloudflare Support**: [Dashboard Support](https://dash.cloudflare.com/)
- **Anthropic Support**: support@anthropic.com
- **Fish Audio Support**: [Fish Audio Support](https://fish.audio/)
- **Repository**: [GitHub Issues](https://github.com/yourusername/briefcast/issues)

## Deployment History

| Date | Version | Deployed By | Notes |
|------|---------|-------------|-------|
| YYYY-MM-DD | v1.0.0 | Your Name | Initial deployment |

## Sign-Off

- [ ] Deployment completed successfully
- [ ] All critical tests passed
- [ ] Monitoring configured and working
- [ ] Documentation updated
- [ ] Team notified (if applicable)

**Deployed by**: ________________
**Date**: ________________
**Version**: ________________
