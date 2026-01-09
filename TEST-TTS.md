# Testing TTS Generation

This guide shows you how to test the gpt-4o-mini-tts implementation without affecting your production emails or podcast feed.

## Quick Start

### 1. Set Environment Variables

```bash
export BRIEFCAST_URL="https://your-worker.workers.dev"
export BRIEFCAST_TOKEN="your-secret-api-token"
```

### 2. Create a Test Script

Save your podcast script to a text file:

```bash
cat > test-script.txt << 'EOF'
Welcome to today's tech briefing. Let me tell you about the latest developments in artificial intelligence.

Recent advances in large language models have shown remarkable improvements in reasoning capabilities. Researchers have found that combining multiple approaches leads to better results.

In other news, new tools are making it easier for developers to build AI-powered applications. The ecosystem continues to grow rapidly.

That's all for today's briefing. Thanks for listening!
EOF
```

### 3. Run the Test

```bash
./test-tts.sh test-script.txt
```

### 4. Test with Custom Style Prompt

```bash
./test-tts.sh test-script.txt "You are an enthusiastic tech podcaster. Speak with energy and excitement!"
```

## Using curl Directly

If you prefer to use curl directly:

### Basic Test

```bash
curl -X POST "https://your-worker.workers.dev/test-tts" \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world! This is a test of the text-to-speech system."
  }'
```

### With Custom Style Prompt

```bash
curl -X POST "https://your-worker.workers.dev/test-tts" \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Welcome to the podcast!",
    "style_prompt": "You are a calm, professional news anchor"
  }'
```

### From a File (using jq)

```bash
TEXT=$(cat test-script.txt)
curl -X POST "https://your-worker.workers.dev/test-tts" \
  -H "Authorization: Bearer your-secret-token" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg text "$TEXT" '{text: $text}')"
```

## API Response

### Success Response

```json
{
  "success": true,
  "message": "TTS generation successful",
  "audioUrl": "https://your-r2-bucket.r2.dev/test-2026-01-09T12-30-45-123Z.mp3",
  "audioSizeBytes": 245760,
  "durationSeconds": 45,
  "chunks": 2
}
```

The audio file is saved to R2 with a `test-` prefix and timestamp, so you can download and listen to it!

### Error Response

```json
{
  "success": false,
  "message": "TTS generation failed",
  "error": "Style prompt is too long (2100 tokens). Maximum allowed is ~1900 tokens to leave room for content."
}
```

## Testing Different Scenarios

### 1. Test Default Configuration

Tests using the `style_prompt` from your config.yaml:

```bash
./test-tts.sh test-script.txt
```

### 2. Test Different Voice Styles

```bash
# Professional news anchor
./test-tts.sh test-script.txt "You are a professional news anchor. Speak with authority and clarity."

# Casual tech podcaster
./test-tts.sh test-script.txt "You are a friendly tech podcaster. Speak conversationally with enthusiasm."

# Educational tone
./test-tts.sh test-script.txt "You are an engaging teacher. Speak clearly and slowly, emphasizing key points."

# Storytelling style
./test-tts.sh test-script.txt "You are a captivating storyteller. Use dramatic pauses and varied intonation."
```

### 3. Test Long Scripts

Test chunking behavior with a longer script:

```bash
# Generate a longer test script
for i in {1..5}; do
  cat test-script.txt >> long-script.txt
done

./test-tts.sh long-script.txt
```

### 4. Test Token Limit Edge Cases

```bash
# Very short script (should work)
echo "Hello world!" > short.txt
./test-tts.sh short.txt

# Very long prompt (should fail with clear error)
./test-tts.sh test-script.txt "$(printf 'word %.0s' {1..2000})"
```

## Understanding the Output

The test script shows:

- **Words**: Word count of your script
- **Characters**: Character count
- **Estimated duration**: Based on 150 words per minute
- **Audio Size**: Size of generated MP3 in bytes
- **Duration**: Actual audio duration in seconds
- **Chunks**: Number of API calls made (due to token limit)

## Important Notes

1. **R2 Storage**: The `/test-tts` endpoint saves audio to your R2 bucket with a `test-` prefix. Files are named like: `test-2026-01-09T12-30-45-123Z.mp3`

2. **Download & Listen**: You get the full URL in the response. Open it in your browser or download with curl to listen.

3. **Cost**: This endpoint uses your OpenAI API quota. Each test costs approximately $0.015 per minute of audio.

4. **Token Limits**: The API has a 2000 token limit. Long scripts are automatically chunked.

5. **Style Prompt Override**: If you provide a `style_prompt` in the request, it overrides the one in config.yaml for that test only.

6. **Authentication**: Requires the same API_AUTH_TOKEN used for other API endpoints.

7. **Cleanup**: Test files stay in R2 until you manually delete them. They won't appear in your RSS feed.

## Troubleshooting

### Error: "Missing Authorization header"

Set your BRIEFCAST_TOKEN:
```bash
export BRIEFCAST_TOKEN="your-token-here"
```

### Error: "Style prompt is too long"

Your style prompt exceeds ~1950 tokens. Simplify it:
```bash
# Too long ❌
./test-tts.sh script.txt "$(cat very-long-instructions.txt)"

# Good ✓
./test-tts.sh script.txt "You are a professional podcast host"
```

### Error: "Connection refused"

Check your BRIEFCAST_URL:
```bash
export BRIEFCAST_URL="https://briefcast.your-account.workers.dev"
```

### Script shows 0 chunks

The chunk count is estimated. Check the actual audio generation was successful by looking at audioSizeBytes > 0.

## Examples

### Example 1: Testing Your Actual Podcast Script

```bash
# Copy your script from somewhere
cat > my-actual-script.txt
# Paste your script content
# Press Ctrl+D when done

# Test it
./test-tts.sh my-actual-script.txt
```

### Example 2: Comparing Voice Styles

```bash
# Save different results to compare
./test-tts.sh script.txt "Professional tone" > result-professional.json
./test-tts.sh script.txt "Casual tone" > result-casual.json
./test-tts.sh script.txt "Energetic tone" > result-energetic.json

# Compare durations
cat result-*.json | jq '{style: .message, duration: .durationSeconds}'
```

### Example 3: Batch Testing Multiple Scripts

```bash
for script in scripts/*.txt; do
  echo "Testing $script..."
  ./test-tts.sh "$script"
  echo "---"
done
```

## Example Output

When you run the test script, you'll see:

```bash
✓ TTS Generation Successful!

Response:
{
  "success": true,
  "message": "TTS generation successful",
  "audioUrl": "https://your-r2.r2.dev/test-2026-01-09T12-30-45-123Z.mp3",
  "audioSizeBytes": 89344,
  "durationSeconds": 54,
  "chunks": 1
}

Audio Metrics:
  - Size: 87.2 KiB
  - Duration: 54s (~0m 54s)
  - Chunks processed: 1

✓ Test completed successfully!

Audio URL:
  https://your-r2.r2.dev/test-2026-01-09T12-30-45-123Z.mp3

Download and listen:
  curl -o test-audio.mp3 "https://your-r2.r2.dev/test-2026-01-09T12-30-45-123Z.mp3"

Or open directly in your browser/player:
  https://your-r2.r2.dev/test-2026-01-09T12-30-45-123Z.mp3
```

## Next Steps

Once you're happy with the test results:

1. **Deploy your changes**: `npm run deploy`
2. **Test immediately**: Run `./test-tts.sh your-script.txt` and listen to the result
3. **Refine your style_prompt**: Adjust based on what you hear
4. **Update config.yaml in R2** with your final `style_prompt`
5. **Generate your first real episode**

## Cleaning Up Test Files

Test files are saved to R2 but don't appear in your RSS feed. To clean them up:

```bash
# List all test files
wrangler r2 object list YOUR_BUCKET --prefix="test-"

# Delete a specific test file
wrangler r2 object delete YOUR_BUCKET test-2026-01-09T12-30-45-123Z.mp3

# Delete all test files (careful!)
wrangler r2 object list YOUR_BUCKET --prefix="test-" | jq -r '.objects[].key' | xargs -I {} wrangler r2 object delete YOUR_BUCKET {}
```

## Cost Estimation

- Test script (500 words): ~$0.05
- Full podcast (1500 words): ~$0.12
- Daily podcast (30 episodes/month): ~$3.60/month

The test endpoint helps you perfect your configuration before generating production episodes!
