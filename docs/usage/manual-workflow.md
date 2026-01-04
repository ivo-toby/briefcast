# Manual Workflow Guide

How to manually control the Briefcast workflow using API endpoints.

## Overview

While Briefcast runs automatically on a cron schedule, you can manually control each step of the workflow.

## Workflow Steps

1. **Receive Emails** → Automatic (Email Workers)
2. **Generate Script** → Manual trigger
3. **Review Script** → Manual approval
4. **Generate Audio** → Triggered by approval
5. **Publish Episode** → Automatic (on approval)

## Prerequisites

```bash
# Set your API token
export API_TOKEN="your-api-auth-token"
export WORKER_URL="https://your-worker.workers.dev"
```

## Manual Trigger

Manually trigger script generation from accumulated emails.

```bash
curl -X POST "$WORKER_URL/trigger" \
  -H "Authorization: Bearer $API_TOKEN"
```

**Response**:
```json
{
  "success": true,
  "message": "Triggered successfully"
}
```

**What happens**:
- Fetches all emails from KV storage
- Parses and extracts content
- Generates script using Claude
- Stores script as pending
- Deletes processed emails

## View Pending Scripts

List all scripts waiting for approval.

```bash
curl "$WORKER_URL/pending" \
  -H "Authorization: Bearer $API_TOKEN"
```

**Response**:
```json
{
  "scripts": [
    {
      "id": "script-20260104-abc123",
      "date": "2026-01-04T10:00:00Z",
      "content": "Welcome to this week's AI news...",
      "wordCount": 450,
      "status": "pending"
    }
  ]
}
```

## Approve Script

Approve a pending script to generate audio and publish.

```bash
SCRIPT_ID="script-20260104-abc123"

curl -X POST "$WORKER_URL/approve/$SCRIPT_ID" \
  -H "Authorization: Bearer $API_TOKEN"
```

**Response**:
```json
{
  "success": true,
  "message": "Script approved",
  "audioUrl": "https://pub-xxxxx.r2.dev/episodes/20260104-abc123.mp3"
}
```

**What happens**:
- Generates audio using Fish Audio TTS
- Stores audio file in R2
- Updates RSS feed with new episode
- Deletes pending script
- Returns public audio URL

## Reject Script

Reject a pending script without publishing.

```bash
SCRIPT_ID="script-20260104-abc123"

curl -X POST "$WORKER_URL/reject/$SCRIPT_ID" \
  -H "Authorization: Bearer $API_TOKEN"
```

**Response**:
```json
{
  "success": true,
  "message": "Script rejected"
}
```

**What happens**:
- Deletes pending script
- No audio generated
- No RSS feed update

## Complete Workflow Example

### 1. Trigger Script Generation

```bash
# Monday morning: trigger weekly aggregation
curl -X POST "$WORKER_URL/trigger" \
  -H "Authorization: Bearer $API_TOKEN"
```

### 2. Review Pending Script

```bash
# Get pending scripts
curl "$WORKER_URL/pending" \
  -H "Authorization: Bearer $API_TOKEN" \
  | jq '.scripts[0]'
```

**Review the script content**:
```json
{
  "id": "script-20260104-abc123",
  "content": "Welcome to this week in AI...",
  "wordCount": 450
}
```

### 3. Approve or Reject

**If script looks good**:
```bash
curl -X POST "$WORKER_URL/approve/script-20260104-abc123" \
  -H "Authorization: Bearer $API_TOKEN"
```

**If script needs revision**:
```bash
# Reject and trigger again
curl -X POST "$WORKER_URL/reject/script-20260104-abc123" \
  -H "Authorization: Bearer $API_TOKEN"

# Trigger new generation
curl -X POST "$WORKER_URL/trigger" \
  -H "Authorization: Bearer $API_TOKEN"
```

### 4. Verify Publication

```bash
# Check RSS feed
curl https://pub-xxxxx.r2.dev/feed.xml

# Listen to audio
curl -O https://pub-xxxxx.r2.dev/episodes/20260104-abc123.mp3
```

## Advanced Usage

### Batch Operations

```bash
# Get all pending scripts
SCRIPTS=$(curl -s "$WORKER_URL/pending" \
  -H "Authorization: Bearer $API_TOKEN" \
  | jq -r '.scripts[].id')

# Approve all
for script_id in $SCRIPTS; do
  curl -X POST "$WORKER_URL/approve/$script_id" \
    -H "Authorization: Bearer $API_TOKEN"
done
```

### Automated Review Script

```bash
#!/bin/bash
# review-script.sh

API_TOKEN="your-token"
WORKER_URL="https://your-worker.workers.dev"

# Get pending scripts
PENDING=$(curl -s "$WORKER_URL/pending" \
  -H "Authorization: Bearer $API_TOKEN")

# Show first script
SCRIPT_ID=$(echo "$PENDING" | jq -r '.scripts[0].id')
CONTENT=$(echo "$PENDING" | jq -r '.scripts[0].content')

echo "Script ID: $SCRIPT_ID"
echo "Content:"
echo "$CONTENT"
echo ""
read -p "Approve? (y/n): " APPROVE

if [ "$APPROVE" = "y" ]; then
  curl -X POST "$WORKER_URL/approve/$SCRIPT_ID" \
    -H "Authorization: Bearer $API_TOKEN"
else
  curl -X POST "$WORKER_URL/reject/$SCRIPT_ID" \
    -H "Authorization: Bearer $API_TOKEN"
fi
```

### Monitoring

```bash
# Check for pending scripts (cron job)
PENDING_COUNT=$(curl -s "$WORKER_URL/pending" \
  -H "Authorization: Bearer $API_TOKEN" \
  | jq '.scripts | length')

if [ "$PENDING_COUNT" -gt 0 ]; then
  echo "⚠️  $PENDING_COUNT scripts pending review"
  # Send notification (email, Slack, etc.)
fi
```

## Auto-Approve Mode

To skip manual review entirely, update `config.yaml`:

```yaml
workflow:
  auto_approve: true
```

**Behavior**:
- Scripts automatically approved after generation
- Audio generated immediately
- Episodes published without review
- Use for trusted content sources only

## Troubleshooting

**401 Unauthorized**
- Verify API_AUTH_TOKEN is set correctly
- Check Authorization header format
- Ensure token matches wrangler secret

**404 Not Found**
- Verify Worker URL
- Check endpoint path (/trigger, /pending, etc.)
- Confirm worker is deployed

**Script not generated**
- Check if emails exist in KV storage
- Verify Anthropic API key is valid
- Check worker logs for errors

**Audio generation fails**
- Verify Fish Audio API key
- Check account has sufficient credits
- Review Fish Audio API logs
