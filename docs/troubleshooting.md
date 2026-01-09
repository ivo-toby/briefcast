# Troubleshooting Guide

## Common Issues

### No Emails Received

- Check Cloudflare Email Routing configuration
- Verify destination address is correct
- Check Worker logs for errors

### No Podcast Generated

- Check if emails were stored in KV
- Review Worker logs for errors
- Verify cron trigger is configured
- Check Claude/OpenAI API keys are valid

### Script Generation Fails

- Verify Anthropic API key
- Check API quota/billing
- Review Worker logs for specific error

### TTS Generation Fails

- Verify OpenAI API key
- Check API quota/billing and ensure billing is enabled
- Confirm voice and model settings are correct (see config.yaml)

### Config Not Loading

- Verify config.yaml is in R2 bucket root
- Check YAML syntax is valid
- Review Worker logs for validation errors

## Debugging

View logs:
```bash
wrangler tail
```

Check KV storage:
```bash
wrangler kv:key list --namespace-id=<ID>
```

Check R2 storage:
```bash
wrangler r2 object list briefcast-podcasts
```

## Getting Help

Check Worker logs first - they contain detailed error messages.
