import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type Content as BaseContent,
  type GenerateTextParams,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  Service,
  type State,
  logger,
} from '@elizaos/core';
import { z } from 'zod';
import fetch from 'node-fetch';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Extend the Content type to include attachments
interface Content extends BaseContent {
  attachments?: Array<{
    id: string;
    url: string;
    title: string;
    source: string;
    description: string;
    contentType: string;
    text: string;
  }>;
}

// Define the configuration schema for the plugin
const configSchema = z.object({
  LORALAB_API_KEY: z
    .string()
    .min(1, 'LoraLab API key is required')
    .transform((val) => {
      if (!val) {
        logger.error('LORALAB_API_KEY is not provided. Image generation will not work.');
      }
      return val;
    }),
});

// Define supported models and aspect ratios
enum ImageModelType {
  FLUX = 'flux',
  GEMINI = 'gemini',
  IMAGEN = 'imagen',
}

enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT = '3:4',
  LANDSCAPE = '4:3',
  MOBILE = '9:16', 
  WIDESCREEN = '16:9',
}

enum OutputFormat {
  WEBP = 'webp',
  PNG = 'png',
  JPEG = 'jpeg',
}

// Define supported video models
enum VideoModelType {
  WAN = 'wan', // Default video model
}

// Interface for the prompt enhancement request
interface PromptEnhancementRequest {
  prompt: string;
  enhance_prompt: boolean;
}

// Interface for the prompt enhancement response
interface PromptEnhancementResponse {
  original_prompt: string;
  option_1: string;
  option_2?: string;
  training_id?: string | null;
  filter_type?: string | null;
  nsfw_detected?: boolean | null;
}

// Interface for the image generation request
interface ImageGenerationRequest {
  prompt: string;
  enhance_prompt?: boolean;
  output_format?: OutputFormat;
  aspect_ratio?: AspectRatio;
  model_type?: ImageModelType;
}

// Interface for the image generation response
interface ImageGenerationResponse {
  url: string;
  enhanced_prompt?: string;
  generation_id?: string;
  [key: string]: any; // For any additional fields
}

// Interface for the video generation request
interface VideoGenerationRequest {
  prompt: string;
  enhance_prompt?: boolean;
  model_type?: VideoModelType;
}

// Interface for the video generation response
interface VideoGenerationResponse {
  video_id: string;
  status: string;
  message: string;
}

// Interface for the video status check response
interface VideoStatusResponse {
  id: string;
  generation_id: string;
  video_prompt: string;
  video_url: string;
  created_at: string;
  is_public_generation: boolean;
  status: string;
  can_be_made_public: boolean;
}

/**
 * Enhances a prompt using the LoraLab API
 * @param prompt The original prompt
 * @param apiKey The LoraLab API key
 * @returns The enhanced prompt
 */
async function enhancePrompt(prompt: string, apiKey: string): Promise<string> {
  logger.info(`Enhancing prompt: "${prompt}"`);
  
  try {
    const response = await fetch('https://api.ta-da.io/tadzagent/api/v1/previews/image-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        prompt,
        enhance_prompt: true
      } as PromptEnhancementRequest),
    });

    if (!response.ok) {
      logger.error(`Failed to enhance prompt: ${response.status} ${response.statusText}`);
      return prompt; // Return original prompt if enhancement fails
    }

    const result = await response.json() as PromptEnhancementResponse;
    logger.info(`Enhanced prompt received with options`);
    
    // Use option_1 as the enhanced prompt
    const enhancedPrompt = result.option_1 ? `${prompt}${result.option_1}` : prompt;
    logger.info(`Using enhanced prompt: "${enhancedPrompt}"`);
    
    return enhancedPrompt;
  } catch (error) {
    logger.error('Error enhancing prompt:', error);
    return prompt; // Return original prompt if enhancement fails
  }
}

/**
 * GENERATE_IMAGE action
 * Allows the agent to generate images using the LoraLab API
 */
const generateImageAction: Action = {
  name: 'GENERATE_IMAGE',
  similes: ['CREATE_IMAGE', 'MAKE_IMAGE', 'DRAW_IMAGE', 'GENERATE_A', 'DRAW', 'DRAW_A', 'MAKE_A'],
  description: 'Generates an image using the LoraLab API based on a text prompt',

  validate: async (runtime: IAgentRuntime, message: Memory, _state: State): Promise<boolean> => {
    // Check if API key is available
    const apiKey = runtime.getSetting('LORALAB_API_KEY');
    if (!apiKey) {
      logger.error('LORALAB_API_KEY is not provided. Image generation will not work.');
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ) => {
    try {
      logger.info('Handling GENERATE_IMAGE action');
      
      // Get the API key from runtime settings
      const apiKey = runtime.getSetting('LORALAB_API_KEY');
      if (!apiKey) {
        throw new Error('LORALAB_API_KEY is not provided. Cannot generate images.');
      }

      // Extract prompt from message or options
      let prompt = '';
      if (options && options.prompt) {
        prompt = options.prompt;
      } else if (message.content && message.content.text) {
        // If no explicit prompt, use the message text
        prompt = message.content.text;
      }

      if (!prompt) {
        throw new Error('No prompt provided for image generation');
      }
      
      // First enhance the prompt
      const enhancedPrompt = await enhancePrompt(prompt, apiKey);

      // Prepare request parameters with defaults - using enhanced prompt and setting enhance_prompt to false
      const requestParams: ImageGenerationRequest = {
        prompt: enhancedPrompt,
        enhance_prompt: false, // Already enhanced
        output_format: OutputFormat.WEBP,
        aspect_ratio: AspectRatio.SQUARE,
        // model_type defaults to Imagen if not specified
      };

      logger.info(`Generating image with enhanced prompt: "${enhancedPrompt}"`);
      
      // Make API request to LoraLab
      let result: ImageGenerationResponse;
      try {
        logger.info(`Sending request to LoraLab API`);
        const response = await fetch('https://api.ta-da.io/tadzagent/api/v1/direct/images', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify(requestParams),
        });

        logger.info(`Received response with status: ${response.status}`);
        
        if (!response.ok) {
          const errorBody = await response.text();
          logger.error(`API error (${response.status}): ${errorBody}`);
          
          // Parse error message if possible
          let errorMessage = "Unknown error occurred";
          try {
            const errorJson = JSON.parse(errorBody);
            errorMessage = errorJson.detail || "Unknown API error";
          } catch (e) {
            errorMessage = errorBody || "Unknown error";
          }
          
          // Handle specific error codes
          if (response.status === 500) {
            throw new Error(`Image generation failed. This may be due to content restrictions or prompt complexity. Please try a different prompt. API message: ${errorMessage}`);
          } else if (response.status === 400) {
            throw new Error(`Invalid request: ${errorMessage}`);
          } else if (response.status === 401 || response.status === 403) {
            throw new Error(`Authentication failed. Please check your API key.`);
          } else {
            throw new Error(`Image generation failed (${response.status}): ${errorMessage}`);
          }
        }

        // Get the response text and log it
        const responseText = await response.text();
        logger.info(`Response body: ${responseText}`);
        
        try {
          // Parse the JSON response
          result = JSON.parse(responseText) as ImageGenerationResponse;
          logger.info(`Parsed response: ${JSON.stringify(result)}`);
          
          if (!result.url) {
            logger.error(`URL missing in response: ${JSON.stringify(result)}`);
            throw new Error("API response missing URL");
          }
          
          logger.info(`Image URL: ${result.url}`);
        } catch (parseError) {
          logger.error(`Failed to parse JSON response: ${parseError.message}`);
          throw new Error(`Failed to parse API response: ${parseError.message}`);
        }
      } catch (error) {
        logger.error('LoraLab API request failed:', error);
        throw error;
      }
      
      // Create response content with the image URL
      const responseContent: Content = {
        text: `I've generated an image based on your prompt: "${enhancedPrompt}"`,
        actions: ['GENERATE_IMAGE'],
        source: message.content.source,
        attachments: [
          {
            id: result.generation_id || crypto.randomUUID(),
            url: result.url,
            title: "Generated Image",
            source: "loraLabImageGeneration",
            description: `Image generated from prompt: "${enhancedPrompt}"`,
            contentType: "image/webp",
            text: "Here's your generated image."
          }
        ]
      };
      
      logger.info(`Sending response with attachment: ${JSON.stringify(responseContent.attachments)}`);
      
      // Send response via callback - use the pattern from the official plugin
      try {
        await callback(responseContent);
        logger.info('Callback completed successfully');
      } catch (callbackError) {
        logger.error('Error in callback:', callbackError);
        // If there's an error with the attachment, try sending a text-only response with the URL
        await callback({
          text: `I generated an image, but had trouble displaying it. You can view it here: ${result.url}`,
          actions: ['GENERATE_IMAGE'],
          source: message.content.source
        });
      }
      
      return responseContent;
    } catch (error) {
      logger.error('Error in GENERATE_IMAGE action:', error);
      
      // Create a user-friendly error message
      let userMessage = "Sorry, I couldn't generate the image.";
      
      // Extract the most useful part of the error message
      const errorMsg = error.message || "";
      if (errorMsg.includes("content restrictions")) {
        userMessage = "I couldn't generate that image. It may violate content policies (like real people, explicit content, etc). Please try a different subject.";
      } else if (errorMsg.includes("API key")) {
        userMessage = "There's an issue with the API configuration. Please contact the administrator to check the API key.";
      } else if (errorMsg.includes("try a different prompt")) {
        userMessage = "I couldn't generate an image for that subject. Please try a different description or topic.";
      } else if (errorMsg.includes("Failed to parse")) {
        userMessage = "There was an issue processing the image. Please try again with a different description.";
        logger.error("JSON parsing error in response");
      } else if (errorMsg.includes("missing URL")) {
        userMessage = "The image was generated but there was an issue retrieving it. Please try again.";
        logger.error("URL missing in response");
      } else if (errorMsg.includes("enhance prompt")) {
        userMessage = "I couldn't enhance your prompt. Trying with the original prompt...";
        logger.error("Prompt enhancement failed");
      }
      
      // If we have a URL in the error, try to include it
      const urlMatch = errorMsg.match(/https?:\/\/[^\s"]+/);
      let errorResponse: Content = {
        text: userMessage,
        actions: ['GENERATE_IMAGE'],
        source: message.content.source
      };
      
      if (urlMatch && urlMatch[0]) {
        errorResponse.text += `\n\nTry accessing the image directly: ${urlMatch[0]}`;
        // Add attachment if we have a URL
        errorResponse.attachments = [{
          id: 'error-image',
          url: urlMatch[0],
          title: "Generated Image (Error Recovery)",
          source: "loraLabImageGeneration",
          description: "Image recovered from error message",
          contentType: "image/webp",
          text: "Here's the image that was generated before the error."
        }];
      }
      
      logger.info(`Sending error response: "${errorResponse.text}"`);
      
      // Send error response
      try {
        await callback(errorResponse);
        logger.info('Error callback completed successfully');
      } catch (callbackError) {
        logger.error('Error in error callback:', callbackError);
      }
      
      return errorResponse;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Can you generate an image of a sunset over mountains?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: "I've generated an image based on your prompt: \"a sunset over mountains, with dramatic orange and purple skies, silhouetted mountain ranges in the distance, golden light reflecting off clouds, 4K detailed nature photography\"",
          actions: ['GENERATE_IMAGE'],
          media: [{
            type: 'image',
            url: 'https://example.com/image.png',
            alt: 'a sunset over mountains',
            // Note: Image generated using Imagen model with 1:1 aspect ratio
          }],
        },
      },
    ],
  ],
};

/**
 * Generates a video using the LoraLab API
 * @param prompt The video prompt
 * @param apiKey The LoraLab API key
 * @returns The video URL when generation is complete
 */
async function generateVideo(prompt: string, apiKey: string): Promise<string> {
  logger.info(`Starting video generation with prompt: "${prompt}"`);
  
  try {
    // Step 1: Start video generation
    const initialResponse = await fetch('https://api.ta-da.io/tadzagent/api/v1/direct/videos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        prompt,
        enhance_prompt: true,
        model_type: VideoModelType.WAN
      } as VideoGenerationRequest),
    });

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      logger.error(`Failed to start video generation: ${initialResponse.status} ${initialResponse.statusText}`, errorText);
      throw new Error(`Video generation request failed: ${errorText}`);
    }

    const initialData = await initialResponse.json() as VideoGenerationResponse;
    logger.info(`Video generation started with ID: ${initialData.video_id}`);
    
    // Step 2: Poll for completion
    let status = initialData.status;
    let videoUrl: string | null = null;
    const videoId = initialData.video_id;
    const maxRetries = 30; // Maximum number of retries (about 5 minutes with 10s intervals)
    let retryCount = 0;
    
    while (status !== 'completed' && status !== 'failed' && retryCount < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds between checks
      retryCount++;
      
      const statusResponse = await fetch(`https://api.ta-da.io/tadzagent/api/v1/generations/videos/${videoId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        }
      });
      
      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        logger.error(`Failed to check video status: ${statusResponse.status} ${statusResponse.statusText}`, errorText);
        continue; // Continue polling even if this check failed
      }
      
      const statusData = await statusResponse.json() as VideoStatusResponse;
      logger.info(`Video status check (${retryCount}/${maxRetries}): ${statusData.status}`);
      
      status = statusData.status;
      if (status === 'completed' && statusData.video_url) {
        videoUrl = statusData.video_url;
        break;
      }
    }
    
    if (status === 'failed') {
      throw new Error('Video generation failed');
    }
    
    if (!videoUrl) {
      throw new Error('Video generation timed out or no URL was provided');
    }
    
    logger.info(`Video generation completed. URL: ${videoUrl}`);
    return videoUrl;
  } catch (error) {
    logger.error('Video generation error:', error);
    throw error;
  }
}

/**
 * GENERATE_VIDEO action
 * Allows the agent to generate videos using the LoraLab API
 */
const generateVideoAction: Action = {
  name: 'GENERATE_VIDEO',
  similes: ['CREATE_VIDEO', 'MAKE_VIDEO', 'RENDER_VIDEO', 'VIDEO_GEN', 'ANIMATE'],
  description: 'Generates a video using the LoraLab API based on a text prompt',

  validate: async (runtime: IAgentRuntime, message: Memory, _state: State): Promise<boolean> => {
    // Check if API key is available
    const apiKey = runtime.getSetting('LORALAB_API_KEY');
    if (!apiKey) {
      logger.error('LORALAB_API_KEY is not provided. Video generation will not work.');
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ) => {
    try {
      logger.info('Handling GENERATE_VIDEO action');
      
      // Get the API key from runtime settings
      const apiKey = runtime.getSetting('LORALAB_API_KEY');
      if (!apiKey) {
        throw new Error('LORALAB_API_KEY is not provided. Cannot generate videos.');
      }

      // Extract prompt from message or options
      let prompt = '';
      if (options && options.prompt) {
        prompt = options.prompt;
      } else if (message.content && message.content.text) {
        // Clean up the prompt by removing commands
        prompt = message.content.text
          .replace(/generate video|create video|make video|render video|animate/gi, '')
          .trim();
      }

      if (!prompt) {
        throw new Error('No prompt provided for video generation');
      }

      // Initial response to user
      await callback({
        text: `I'm generating a video based on your prompt: "${prompt}". This will take about a minute...`,
        actions: ['GENERATE_VIDEO'],
        source: message.content.source
      });
      
      // Generate video
      const videoUrl = await generateVideo(prompt, apiKey);
      
      try {
        // Ensure content_cache directory exists
        const cacheDir = path.join(process.cwd(), 'content_cache');
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
          logger.info(`Created cache directory at ${cacheDir}`);
        }
        
        // Download the video file
        logger.info(`Downloading video from URL: ${videoUrl}`);
        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const videoFileName = path.join(cacheDir, `generated_video_${Date.now()}.mp4`);
        
        // Save video file
        fs.writeFileSync(videoFileName, Buffer.from(arrayBuffer));
        logger.info(`Video downloaded and saved to ${videoFileName}`);
        
        // Create response content with the video URL
        const responseContent: Content = {
          text: `Here's your generated video based on the prompt: "${prompt}"`,
          actions: ['GENERATE_VIDEO'],
          source: message.content.source,
          attachments: [
            {
              id: crypto.randomUUID(),
              url: `file://${videoFileName}`,  // Use local file path with file:// protocol
              title: "Generated Video",
              source: "loraLabVideoGeneration",
              description: `Video generated from prompt: "${prompt}"`,
              contentType: "video/mp4",
              text: "Here's your generated video."
            }
          ]
        };
        
        // Send response via callback, including the local file
        await callback(responseContent, [videoFileName]);
        logger.info('Video callback completed successfully');
        
        return responseContent;
      } catch (downloadError) {
        logger.error('Error downloading video:', downloadError);
        
        // If download fails, still try to deliver the URL
        const fallbackContent: Content = {
          text: `Here's your generated video based on the prompt: "${prompt}"`,
          actions: ['GENERATE_VIDEO'],
          source: message.content.source,
          attachments: [
            {
              id: crypto.randomUUID(),
              url: videoUrl,  // Keep using remote URL as fallback
              title: "Generated Video (Remote Link)",
              source: "loraLabVideoGeneration",
              description: `Video generated from prompt: "${prompt}" (remote link)`,
              contentType: "video/mp4",
              text: "Here's your generated video (remote link)."
            }
          ]
        };
        
        await callback(fallbackContent);
        logger.info('Fallback video callback completed');
        
        return fallbackContent;
      }
    } catch (error) {
      logger.error('Error in GENERATE_VIDEO action:', error);
      
      // Create a user-friendly error message
      let userMessage = "Sorry, I couldn't generate the video.";
      
      // Extract the most useful part of the error message
      const errorMsg = error.message || "";
      if (errorMsg.includes("timed out")) {
        userMessage = "The video generation took too long. Please try again with a simpler prompt.";
      } else if (errorMsg.includes("API key")) {
        userMessage = "There's an issue with the API configuration. Please contact the administrator to check the API key.";
      } else if (errorMsg.includes("failed")) {
        userMessage = "The video generation failed. Please try again with a different description.";
      }
      
      const errorResponse: Content = {
        text: userMessage,
        actions: ['GENERATE_VIDEO'],
        source: message.content.source
      };
      
      logger.info(`Sending error response: "${errorResponse.text}"`);
      
      // Send error response
      try {
        await callback(errorResponse);
        logger.info('Error callback completed successfully');
      } catch (callbackError) {
        logger.error('Error in error callback:', callbackError);
      }
      
      return errorResponse;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Can you generate a video of a sunset over mountains?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: "Here's your generated video based on the prompt: \"a sunset over mountains\"",
          actions: ['GENERATE_VIDEO'],
          media: [{
            type: 'video',
            url: 'https://example.com/video.mp4',
            alt: 'a sunset over mountains',
          }],
        },
      },
    ],
  ],
};

/**
 * LoraLab service implementation
 */
export class LoraLabService extends Service {
  static serviceType = 'loralab';
  capabilityDescription = 'Image generation service using LoraLab API.';
  
  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime) {
    logger.info(`Starting LoraLab image generation service: ${new Date().toISOString()}`);
    const service = new LoraLabService(runtime);
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    logger.info('Stopping LoraLab image generation service');
    const service = runtime.getService(LoraLabService.serviceType);
    if (!service) {
      throw new Error('LoraLab service not found');
    }
    service.stop();
  }

  async stop() {
    logger.info('LoraLab service stopped');
  }
}

/**
 * Main plugin definition
 */
export const loraLabPlugin: Plugin = {
  name: 'plugin-loralab',
  description: 'LoraLab image & video generation plugin for elizaOS',
  config: {
    LORALAB_API_KEY: process.env.LORALAB_API_KEY,
  },
  async init(config: Record<string, string>) {
    logger.info('Initializing LoraLab image & video generation plugin');
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }
      
      // Verify API key is available
      const apiKey = process.env.LORALAB_API_KEY;
      if (!apiKey) {
        logger.warn('LORALAB_API_KEY not set - image generation will not work');
      } else {
        logger.info('LoraLab API key configured successfully');
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid plugin configuration: ${error.errors.map((e) => e.message).join(', ')}`
        );
      }
      throw error;
    }
  },
  tests: [
    {
      name: 'loralab_plugin_test_suite',
      tests: [
        {
          name: 'api_key_validation_test',
          fn: async (runtime) => {
            // Check if API key is set
            const apiKey = runtime.getSetting('LORALAB_API_KEY');
            if (!apiKey) {
              logger.warn('LORALAB_API_KEY not set in test environment (this is expected for tests)');
            }
            
            // Verify the plugin is loaded properly
            const service = runtime.getService('loralab');
            if (!service) {
              throw new Error('LoraLab service not found');
            }
          },
        },
        {
          name: 'should_have_generate_image_action',
          fn: async (runtime) => {
            // Check if the generate image action is registered
            const actionExists = loraLabPlugin.actions.some((a) => a.name === 'GENERATE_IMAGE');
            if (!actionExists) {
              throw new Error('GENERATE_IMAGE action not found in plugin');
            }
          },
        },
        {
          name: 'should_have_generate_video_action',
          fn: async (runtime) => {
            // Check if the generate video action is registered
            const actionExists = loraLabPlugin.actions.some((a) => a.name === 'GENERATE_VIDEO');
            if (!actionExists) {
              throw new Error('GENERATE_VIDEO action not found in plugin');
            }
          },
        },
        {
          name: 'prompt_enhancement_test',
          fn: async (runtime) => {
            // This test would normally call the API, but for testing purposes we'll just log
            logger.info('Testing prompt enhancement functionality');
            
            // In a real test, we would mock the fetch API and test the enhancePrompt function
            // Here we're just verifying the function exists
            if (typeof enhancePrompt !== 'function') {
              throw new Error('enhancePrompt function not found');
            }
            
            // Success if we get here
            logger.info('Prompt enhancement test passed');
          },
        },
      ],
    },
  ],
  routes: [
    {
      path: '/loralab/status',
      type: 'GET',
      handler: async (_req: any, res: any) => {
        // Check API key 
        const apiKey = process.env.LORALAB_API_KEY;
        const status = apiKey ? 'configured' : 'not_configured';
        
        res.json({
          status,
          message: apiKey 
            ? 'LoraLab image & video generation plugin is properly configured' 
            : 'LoraLab API key is not configured',
        });
      },
    },
  ],
  events: {
    MESSAGE_RECEIVED: [
      async (params) => {
        logger.debug('LoraLab plugin received a message event');
        // Don't log the params to avoid conflicts
      },
    ],
  },
  services: [LoraLabService],
  actions: [generateImageAction, generateVideoAction],
  providers: [],
};

export default loraLabPlugin;
