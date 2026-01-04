# Monitoring and Observability

Monitor your Briefcast deployment for issues and performance.

## Cloudflare Dashboard

### Workers Analytics

**Access**: Cloudflare Dashboard > Workers & Pages > Your Worker > Metrics

**Key Metrics**:
- **Requests**: Total requests per day
- **Errors**: 4xx/5xx error rates
- **CPU Time**: Average execution time
- **Duration**: P50, P95, P99 latencies

**Alerts**:
```bash
# Set up alerts in dashboard
# Workers > Your Worker > Settings > Alerts
# Configure for:
# - Error rate > 5%
# - CPU time > 50ms average
```

### R2 Analytics

**Access**: R2 > Your Bucket > Metrics

**Key Metrics**:
- **Storage Used**: Total GB stored
- **Read Operations**: Feed/audio requests
- **Egress**: Bandwidth usage

**Cost Monitoring**:
- Storage: $0.015/GB/month
- Read operations: Free
- Egress: $0.36/GB (after first GB)

### Email Routing Logs

**Access**: Email > Email Routing > Logs

**Monitor**:
- Email delivery success rate
- Rejected emails
- Routing rule matches

## Structured Logging

Briefcast uses structured JSON logging for all operations.

### Log Format

```json
{
  "timestamp": "2026-01-04T10:00:00.000Z",
  "level": "info",
  "component": "scheduled-worker",
  "message": "Daily aggregation completed",
  "context": {
    "scriptId": "script-20260104-abc123",
    "emailsProcessed": 5,
    "wordCount": 450
  }
}
```

### Log Levels

- `error`: Critical failures requiring attention
- `warn`: Potential issues, degraded functionality
- `info`: Normal operations, workflow progress
- `debug`: Detailed execution info (disabled in prod)

### Viewing Logs

```bash
# Tail real-time logs
wrangler tail

# Filter by log level
wrangler tail --format json | jq 'select(.level == "error")'

# View specific component
wrangler tail --format json | jq 'select(.component == "script-generator")'
```

## External Monitoring

### Uptime Robot

Monitor RSS feed availability:

```bash
# Monitor endpoint
https://pub-xxxxx.r2.dev/feed.xml

# Alert on:
# - HTTP 5xx errors
# - Response time > 5 seconds
# - Feed not updated for > 48 hours
```

### Sentry Integration

Add error tracking to worker:

```typescript
// src/index.ts
import * as Sentry from '@sentry/cloudflare';

Sentry.init({
  dsn: 'your-sentry-dsn',
  tracesSampleRate: 0.1,
});
```

### Better Stack (Logtail)

Stream logs to Better Stack:

```typescript
// src/lib/logger.ts
export function createLogger(component: string) {
  return {
    info: (message, context) => {
      const entry = { timestamp, level: 'info', component, message, context };

      // Send to Better Stack
      fetch('https://in.logtail.com', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.LOGTAIL_TOKEN}` },
        body: JSON.stringify(entry),
      });
    },
  };
}
```

## Custom Health Checks

### RSS Feed Health

```bash
#!/bin/bash
# check-feed.sh

FEED_URL="https://pub-xxxxx.r2.dev/feed.xml"

# Check if feed is accessible
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$FEED_URL")

if [ "$STATUS" != "200" ]; then
  echo "Feed down: HTTP $STATUS"
  exit 1
fi

# Check if feed was updated recently
LAST_BUILD=$(curl -s "$FEED_URL" | rg -oP '<lastBuildDate>\K[^<]+')
LAST_BUILD_EPOCH=$(date -d "$LAST_BUILD" +%s)
NOW=$(date +%s)
AGE=$((NOW - LAST_BUILD_EPOCH))

if [ "$AGE" -gt 172800 ]; then
  echo "Feed not updated for $((AGE / 3600)) hours"
fi

echo "Feed healthy"
```

### API Health

```bash
#!/bin/bash
# check-api.sh

API_URL="https://your-worker.workers.dev"
API_TOKEN="your-token"

# Check pending endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/pending" \
  -H "Authorization: Bearer $API_TOKEN")

STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$STATUS" != "200" ]; then
  echo "API down: HTTP $STATUS"
  exit 1
fi

echo "API healthy"
```

## Performance Metrics

### Script Generation Time

```typescript
// src/lib/script-generator.ts
export async function generateScript(...) {
  const startTime = Date.now();

  try {
    const script = await retry(() => callClaudeAPI(...));

    const duration = Date.now() - startTime;
    logger.info('Script generated', {
      duration,
      wordCount: script.wordCount,
      tokensUsed: script.metadata.usage,
    });

    return script;
  } catch (error) {
    logger.error('Script generation failed', {
      duration: Date.now() - startTime,
      error,
    });
  }
}
```

### TTS Generation Time

Track audio generation performance:

```typescript
// src/lib/tts-generator.ts
export async function generateAudio(...) {
  const startTime = Date.now();

  const audioFile = await retry(() => callFishAudioAPI(...));

  logger.info('Audio generated', {
    duration: Date.now() - startTime,
    audioLength: audioFile.durationSeconds,
    fileSize: audioFile.fileSizeBytes,
  });
}
```

## Alerting

### Email Alerts

```bash
# Send alert email
send_alert() {
  echo "$1" | mail -s "Briefcast Alert" admin@example.com
}

# Check for errors in logs
ERROR_COUNT=$(wrangler tail --format json \
  | jq -c 'select(.level == "error")' \
  | wc -l)

if [ "$ERROR_COUNT" -gt 10 ]; then
  send_alert "High error rate: $ERROR_COUNT errors in last hour"
fi
```

### Slack Notifications

```bash
#!/bin/bash
# Send to Slack webhook

SLACK_WEBHOOK="https://hooks.slack.com/services/xxx"

notify_slack() {
  curl -X POST "$SLACK_WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "{\"text\": \"$1\"}"
}

notify_slack "Briefcast: 5 scripts pending review"
```

## Common Issues

### High Error Rate

**Investigate**:
```bash
wrangler tail --format json | jq 'select(.level == "error")'
```

**Common Causes**:
- Anthropic/Fish Audio API failures
- Invalid config.yaml
- R2 permission issues

### Memory Exceeded

**Symptoms**: Workers returning 413/500 errors

**Solution**:
- Reduce max_tokens in config
- Process fewer emails per batch
- Optimize content extraction

### Rate Limiting

**Symptoms**: 429 errors from APIs

**Solution**:
- Increase retry backoff
- Reduce request frequency
- Check API rate limits

## Best Practices

1. **Set up monitoring from day one**
2. **Monitor both worker and R2**
3. **Track API usage and costs**
4. **Configure alerts for critical failures**
5. **Review logs weekly for patterns**
6. **Test monitoring in development**
