# Scaling and CDN Configuration

Guide to scaling Briefcast for high traffic and optimizing content delivery.

## Cloudflare R2 Public Buckets

R2 buckets provide automatic global distribution without additional CDN setup.

### Enable Public Access

```bash
# In Cloudflare Dashboard:
# R2 > Your bucket > Settings > Public URL access
# Toggle: Enable

# Note the public URL: https://pub-xxxxx.r2.dev
```

### Configure Custom Domain

```bash
# Add custom domain to R2 bucket
# Settings > Custom Domains > Add domain
# Enter: cdn.yourdomain.com

# DNS record is created automatically
```

**Update config.yaml**:
```yaml
podcast:
  base_url: "https://cdn.yourdomain.com"
```

## Caching Strategy

### R2 Automatic Caching

R2 automatically caches content at Cloudflare edge locations:

- **Audio files**: Cached indefinitely (immutable)
- **RSS feed**: Cache for 1 hour
- **Config**: Cache for 5 minutes

### Cache Headers

Set appropriate cache headers when uploading to R2:

```typescript
// src/lib/storage.ts
export async function storeAudio(audioFile: AudioFile, buffer: ArrayBuffer, env: Env) {
  await env.PODCAST_BUCKET.put(`episodes/${audioFile.id}.mp3`, buffer, {
    httpMetadata: {
      cacheControl: 'public, max-age=31536000, immutable',
      contentType: 'audio/mpeg',
    },
  });
}

export async function updateRSSFeed(feedXml: string, env: Env) {
  await env.PODCAST_BUCKET.put('feed.xml', feedXml, {
    httpMetadata: {
      cacheControl: 'public, max-age=3600',
      contentType: 'application/rss+xml',
    },
  });
}
```

## Traffic Scaling

### Workers Auto-Scaling

Cloudflare Workers automatically scale:

- **Handles millions of requests**
- **No configuration needed**
- **Global distribution by default**

### Rate Limiting

Protect against abuse:

```typescript
// src/api-worker.ts
import { RateLimiter } from '@cloudflare/workers-rate-limiter';

const limiter = new RateLimiter({
  limit: 10,        // 10 requests
  window: 60000,    // per minute
});

export async function handleAPI(request: Request, env: Env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  const { success } = await limiter.limit({ key: ip });
  if (!success) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  // Handle request...
}
```

## Bandwidth Optimization

### Audio Compression

Optimize audio file sizes:

```yaml
# config.yaml
tts:
  bitrate: 64  # kbps (lower = smaller files)
  # 64 kbps: ~30 MB/hour
  # 128 kbps: ~60 MB/hour
```

### Adaptive Bitrate

Serve multiple qualities:

```typescript
// Generate multiple versions
const qualities = [
  { bitrate: 64, suffix: '-low' },
  { bitrate: 128, suffix: '-medium' },
  { bitrate: 192, suffix: '-high' },
];

for (const quality of qualities) {
  const audio = await generateAudio(script, {
    ...config,
    tts: { ...config.tts, bitrate: quality.bitrate },
  });

  await env.PODCAST_BUCKET.put(
    `episodes/${audioFile.id}${quality.suffix}.mp3`,
    audio
  );
}
```

**Update RSS feed**:
```xml
<enclosure
  url="https://cdn.yourdomain.com/episodes/123-medium.mp3"
  type="audio/mpeg"
  length="60000000" />
```

## Cost Optimization

### R2 Pricing

- **Storage**: $0.015/GB/month
- **Class A Operations** (writes): $4.50/million
- **Class B Operations** (reads): Free
- **Egress**: Free (unlike S3)

### Reducing Storage Costs

```typescript
// src/lib/storage.ts
export async function cleanupOldEpisodes(maxEpisodes: number, env: Env) {
  const episodes = await listAudioFiles(env);

  // Sort by date, keep only latest N
  const toDelete = episodes
    .sort((a, b) => b.date - a.date)
    .slice(maxEpisodes);

  for (const episode of toDelete) {
    await env.PODCAST_BUCKET.delete(`episodes/${episode.id}.mp3`);
  }
}
```

**Configure cleanup**:
```yaml
storage:
  max_episodes: 100  # Keep last 100 episodes
```

### Workers Cost

- **Free Tier**: 100,000 requests/day
- **Paid Plan**: $5/month for unlimited

**Estimated monthly requests**:
- Email ingestion: ~300/month (10/day)
- Cron triggers: ~30/month
- API calls: ~100/month
- **Total: ~430/month** (well within free tier)

## Performance Optimization

### Minimize Worker Execution Time

```typescript
// Cache config in memory
let cachedConfig: Config | null = null;
let configExpiry = 0;

export async function loadConfig(env: Env): Promise<Config> {
  const now = Date.now();

  if (cachedConfig && now < configExpiry) {
    return cachedConfig;
  }

  cachedConfig = await fetchConfigFromR2(env);
  configExpiry = now + 300000; // Cache for 5 minutes

  return cachedConfig;
}
```

### Parallel Processing

```typescript
// src/scheduled-worker.ts
export async function handleScheduled(env: Env) {
  const emails = await getEmails(env);

  // Process emails in parallel
  const newsletters = await Promise.all(
    Array.from(emails).map(async ([id, raw]) => {
      const email = await parseEmail(raw);
      const content = extractContent(email, config);
      await deleteEmail(id, env);
      return content;
    })
  );
}
```

### Reduce API Calls

```typescript
// Batch delete emails
export async function deleteEmails(ids: string[], env: Env) {
  await Promise.all(ids.map(id => env.EMAIL_STORE.delete(`email:${id}`)));
}
```

## High Availability

### Multi-Region R2

R2 automatically replicates data across multiple regions.

**No configuration needed** - built-in redundancy.

### Workers Global Distribution

Workers run on Cloudflare's global network:

- **300+ data centers**
- **Automatic failover**
- **Sub-50ms latency worldwide**

### Monitoring Uptime

```bash
# Monitor from multiple regions
# Use StatusCake, Pingdom, or UptimeRobot

# Endpoints to monitor:
# - https://cdn.yourdomain.com/feed.xml
# - https://podcast.yourdomain.com/pending
```

## Scaling Checklist

### Under 100 Subscribers

- ✓ Default configuration works fine
- ✓ Free tier sufficient
- ✓ No special optimization needed

### 100-1,000 Subscribers

- ✓ Enable R2 custom domain
- ✓ Monitor bandwidth usage
- ✓ Consider 64kbps bitrate
- ✓ Implement rate limiting

### 1,000-10,000 Subscribers

- ✓ Use Workers Paid plan ($5/month)
- ✓ Adaptive bitrate streaming
- ✓ Aggressive audio compression
- ✓ Monitor R2 storage costs
- ✓ Set up alerting

### 10,000+ Subscribers

- ✓ Consider CDN in front of R2
- ✓ Implement advanced caching
- ✓ Use Cloudflare Analytics
- ✓ Monitor costs closely
- ✓ Consider sponsorships to offset costs

## Advanced CDN Features

### Transform Images

If adding episode artwork:

```typescript
// Use Cloudflare Image Resizing
await env.PODCAST_BUCKET.put('images/episode-123.jpg', image, {
  httpMetadata: {
    cacheControl: 'public, max-age=31536000',
  },
});

// Access with transforms:
// https://cdn.yourdomain.com/cdn-cgi/image/width=300/images/episode-123.jpg
```

### Geo-Routing

Route users to nearest audio files:

```javascript
// Cloudflare Worker
export async function fetch(request, env) {
  const country = request.cf.country;

  // Route based on geography
  if (['US', 'CA'].includes(country)) {
    return env.US_BUCKET.get(...);
  } else if (['GB', 'DE', 'FR'].includes(country)) {
    return env.EU_BUCKET.get(...);
  }

  return env.GLOBAL_BUCKET.get(...);
}
```

## Troubleshooting

### High Bandwidth Costs

- Check for unusual traffic spikes
- Verify cache headers are set
- Consider lower bitrate
- Implement rate limiting

### Slow Feed Updates

- Check R2 cache headers
- Verify Workers execution time
- Monitor global latency

### Storage Growing Too Fast

- Review max_episodes setting
- Confirm cleanup runs correctly
- Check for duplicate files
