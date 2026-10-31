-- OpenCode Zen moved to /zen: OpenAI-style at https://opencode.ai/zen/v1, Anthropic-style at https://opencode.ai/zen/v1/messages.
UPDATE providers SET openai_base_url = 'https://opencode.ai/zen/v1', anthropic_base_url = 'https://opencode.ai/zen'
  WHERE id = 'opencode-zen' AND openai_base_url = 'https://opencode.ai/inference/openai/v1';
