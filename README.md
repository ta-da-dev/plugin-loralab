# LoraLab Image and Video Generation Plugin for ElizaOS

![ElizaOS Plugin](https://img.shields.io/badge/ElizaOS-Plugin-blue)
![License](https://img.shields.io/badge/license-MIT-green)

This plugin integrates the LoraLab generation API with ElizaOS agents, allowing them to generate high-quality images and videos based on text prompts.

## Features

- Generate high-quality images from text prompts
- Generate videos from text descriptions
- Automatic prompt enhancement for better results
- Fixed settings for optimal results:
  - 1:1 square aspect ratio for balanced image compositions
  - WebP output format for efficient image delivery
  - Optimized video generation settings

## How It Works

### Image Generation
1. When the agent receives an image generation request, it first sends the prompt to the LoraLab API for enhancement
2. The enhancement service adds details and improves the prompt quality
3. The enhanced prompt is then used to generate the final image
4. The agent displays the image with the original prompt for context

### Video Generation
1. The agent sends the prompt to the LoraLab video generation API
2. The API starts the asynchronous video generation process
3. The agent polls the status endpoint until the video is ready (typically 30-60 seconds)
4. Once complete, the video is displayed to the user

## Installation

```bash
# Install in your ElizaOS project
npm install @elizaos/plugin-loralab
```

Or add the plugin directly from GitHub:

```bash
# Clone the repository
git clone https://github.com/ta-da-dev/plugin-loralab.git

# Link the plugin to your ElizaOS project
cd your-elizaos-project
npx elizaos start --plugins=../plugin-loralab
```

## Configuration

You need a LoraLab API key to use this plugin. Set it in your agent's configuration:

```json
{
  "name": "MyAgent",
  "plugins": ["@elizaos/plugin-loralab"],
  "settings": {
    "secrets": {
      "LORALAB_API_KEY": "your-api-key-here"
    }
  }
}
```

## Usage

Once the plugin is installed and configured, your agent can use these actions:

### Image Generation
```
user: Generate an image of a sunset over mountains
agent: [generates and displays an enhanced image of a sunset over mountains]
```

### Video Generation
```
user: Create a video of a car driving through a mountain road
agent: [generates and displays a video of a car driving through a mountain road]
```

## Development

```bash
# Install dependencies
npm install

# Start development with hot-reloading
npm run dev

# Build the plugin
npm run build

# Run tests
npm test

# Test publish readiness
npm run publish:test
```

## Troubleshooting

If you encounter errors when generating content:

- Try using simpler, more descriptive prompts
- For videos, be aware generation can take 30-60 seconds
- Avoid requesting content with specific people, which may be restricted
- Check that your API key is correctly configured

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Publishing

Before publishing your plugin to the ElizaOS registry, ensure you meet these requirements:

1. **GitHub Repository**
   - Create a public GitHub repository for this plugin
   - Add the 'elizaos-plugins' topic to the repository
   - Use 'main' as the default branch

2. **Required Assets**
   - Add images to the `images/` directory:
     - `logo.jpg` (400x400px square, <500KB)
     - `banner.jpg` (1280x640px, <1MB)

3. **Publishing Process**
   ```bash
   # Check if your plugin meets all registry requirements
   npx elizaos publish --test
   
   # Publish to the registry
   npx elizaos publish
   ```

After publishing, your plugin will be submitted as a pull request to the ElizaOS registry for review.

## Configuration

The `agentConfig` section in `package.json` defines the parameters your plugin requires:

```json
"agentConfig": {
  "pluginType": "elizaos:plugin:1.0.0",
  "pluginParameters": {
    "API_KEY": {
      "type": "string",
      "description": "API key for the service"
    }
  }
}
```

Customize this section to match your plugin's requirements.

## Documentation

Provide clear documentation about:
- What your plugin does
- How to use it
- Required API keys or credentials
- Example usage
