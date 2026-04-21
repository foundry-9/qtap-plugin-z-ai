/**
 * Z.AI Provider Plugin for Quilltap
 * Main entry point that exports the plugin configuration
 *
 * This plugin provides:
 * - Chat completion using Z.AI's GLM models (glm-4.6, glm-4.5 series, glm-4-32b-0414-128k)
 * - Vision capabilities (glm-4.5v, glm-4.6v family)
 * - Function calling / tool use
 * - Native web search via Z.AI's web_search tool
 * - Image generation using CogView-4 and GLM-Image
 */

import type { TextProviderPlugin, ImageProviderConstraints, ModelInfo } from './types';
import { ZAIProvider } from './provider';
import { ZAIImageProvider } from './image-provider';
import {
  createPluginLogger,
  parseOpenAIToolCalls,
  type OpenAIToolDefinition,
  type ToolCallRequest,
} from '@quilltap/plugin-utils';
import { hasAnyXMLToolMarkers, parseAllXMLAsToolCalls, stripAllXMLToolMarkers } from '@quilltap/plugin-utils/tools';

const logger = createPluginLogger('qtap-plugin-z-ai');

// Image-generation model IDs are owned by the image provider; keep them out of
// the chat model list merge so they don't leak into the chat picker.
const IMAGE_GEN_MODEL_PATTERN = /^(cogview|glm-image)/i;

/**
 * Static model catalog. Source of truth for context windows / vision flags
 * surfaced in the UI. `getAvailableModels` unions these IDs with what the
 * Z.AI `/models` endpoint returns, since the endpoint doesn't always list
 * vision models like `glm-4.5v` / `glm-4.6v`.
 */
const STATIC_MODELS: ModelInfo[] = [
  {
    id: 'glm-4.6',
    name: 'GLM-4.6',
    contextWindow: 200000,
    maxOutputTokens: 128000,
    supportsImages: false,
    supportsTools: true,
  },
  {
    id: 'glm-4.5',
    name: 'GLM-4.5',
    contextWindow: 131072,
    maxOutputTokens: 98304,
    supportsImages: false,
    supportsTools: true,
  },
  {
    id: 'glm-4.5-x',
    name: 'GLM-4.5-X',
    contextWindow: 131072,
    maxOutputTokens: 98304,
    supportsImages: false,
    supportsTools: true,
  },
  {
    id: 'glm-4.5-air',
    name: 'GLM-4.5-Air',
    contextWindow: 131072,
    maxOutputTokens: 98304,
    supportsImages: false,
    supportsTools: true,
  },
  {
    id: 'glm-4.5-airx',
    name: 'GLM-4.5-AirX',
    contextWindow: 131072,
    maxOutputTokens: 98304,
    supportsImages: false,
    supportsTools: true,
  },
  {
    id: 'glm-4.5-flash',
    name: 'GLM-4.5-Flash',
    contextWindow: 131072,
    maxOutputTokens: 98304,
    supportsImages: false,
    supportsTools: true,
  },
  {
    id: 'glm-4-32b-0414-128k',
    name: 'GLM-4-32B (128K)',
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsImages: false,
    supportsTools: true,
  },
  {
    id: 'glm-4.6v',
    name: 'GLM-4.6V (Vision)',
    contextWindow: 65536,
    maxOutputTokens: 32768,
    supportsImages: true,
    supportsTools: true,
  },
  {
    id: 'glm-4.6v-flashx',
    name: 'GLM-4.6V-FlashX (Vision)',
    contextWindow: 65536,
    maxOutputTokens: 32768,
    supportsImages: true,
    supportsTools: true,
  },
  {
    id: 'glm-4.6v-flash',
    name: 'GLM-4.6V-Flash (Vision)',
    contextWindow: 65536,
    maxOutputTokens: 32768,
    supportsImages: true,
    supportsTools: true,
  },
  {
    id: 'glm-5v-turbo',
    name: 'GLM-5V-Turbo (Vision)',
    contextWindow: 65536,
    maxOutputTokens: 32768,
    supportsImages: true,
    supportsTools: true,
  },
  {
    id: 'glm-4.5v',
    name: 'GLM-4.5V (Vision)',
    contextWindow: 65536,
    maxOutputTokens: 16384,
    supportsImages: true,
    supportsTools: true,
  },
  {
    id: 'cogview-4-250304',
    name: 'CogView-4',
    contextWindow: 4096,
    maxOutputTokens: 1024,
    supportsImages: false,
    supportsTools: false,
  },
  {
    id: 'glm-image',
    name: 'GLM-Image',
    contextWindow: 4096,
    maxOutputTokens: 1024,
    supportsImages: false,
    supportsTools: false,
  },
];

const STATIC_CHAT_MODEL_IDS: string[] = STATIC_MODELS
  .map((m) => m.id)
  .filter((id) => !IMAGE_GEN_MODEL_PATTERN.test(id));

/**
 * Image generation constraints for Z.AI's CogView / GLM-Image models.
 * Z.AI supports discrete recommended sizes rather than aspect ratios.
 * glm-image requires width/height in 1024-2048px, divisible by 32.
 * cogview-4 accepts 512-2048px, divisible by 16.
 */
const Z_AI_IMAGE_CONSTRAINTS: ImageProviderConstraints = {
  maxPromptBytes: 4000,
  promptConstraintWarning: 'Z.AI image prompts should stay under ~4000 characters for reliable results.',
  maxImagesPerRequest: 1,
  supportedSizes: [
    '1024x1024',
    '1280x1280',
    '1568x1056',
    '1056x1568',
    '1664x928',
    '928x1664',
    '1472x1104',
    '1104x1472',
  ],
};

const metadata = {
  providerName: 'Z_AI',
  displayName: 'Z.AI (GLM)',
  description: 'Z.AI GLM models with chat, vision, tool use, web search, and CogView image generation',
  colors: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    icon: 'text-emerald-600',
  },
  abbreviation: 'ZAI',
} as const;

const config = {
  requiresApiKey: true,
  requiresBaseUrl: false,
  apiKeyLabel: 'Z.AI API Key',
} as const;

const capabilities = {
  chat: true,
  imageGeneration: true,
  embeddings: false,
  webSearch: true,
  toolUse: true,
} as const;

const attachmentSupport = {
  supportsAttachments: true as const,
  supportedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as string[],
  description: 'Images (JPEG, PNG, GIF, WebP) — requires a vision model (e.g. glm-4.5v, glm-4.6v)',
  notes: 'Z.AI vision models accept image URLs or base64; limit 5MB per image, max 6000×6000 pixels.',
  maxBase64Size: 5 * 1024 * 1024,
};

const messageFormat = {
  supportsNameField: true,
  supportedRoles: ['user', 'assistant'] as ('user' | 'assistant')[],
  maxNameLength: 64,
};

const cheapModels = {
  defaultModel: 'glm-4.5-flash',
  recommendedModels: ['glm-4.5-flash', 'glm-4.5-air'],
};

export const plugin: TextProviderPlugin = {
  metadata,

  icon: {
    viewBox: '0 0 24 24',
    paths: [
      // Stylized "Z" glyph
      { d: 'M5 4h14v3l-9 10h9v3H5v-3l9-10H5V4z', fill: 'currentColor' },
    ],
  },

  config,

  capabilities,

  attachmentSupport,

  messageFormat,
  charsPerToken: 3.5,
  toolFormat: 'openai',
  cheapModels,
  defaultContextWindow: 131072,

  createProvider: (_baseUrl?: string) => {
    return new ZAIProvider();
  },

  createImageProvider: (_baseUrl?: string) => {
    return new ZAIImageProvider();
  },

  getAvailableModels: async (apiKey: string, _baseUrl?: string) => {
    try {
      const provider = new ZAIProvider();
      const apiModels = await provider.getAvailableModels(apiKey);
      // Z.AI's /models endpoint omits several vision-capable models (e.g.
      // glm-4.5v, glm-4.6v family). Union the API list with our static catalog
      // — minus image-gen IDs, which are owned by the image provider — so
      // vision models always appear in the chat picker.
      const merged = new Set<string>(apiModels.filter((id) => !IMAGE_GEN_MODEL_PATTERN.test(id)));
      for (const id of STATIC_CHAT_MODEL_IDS) merged.add(id);
      return Array.from(merged).sort();
    } catch (error) {
      logger.error(
        'Failed to fetch Z.AI models',
        { context: 'plugin.getAvailableModels' },
        error instanceof Error ? error : undefined
      );
      return [...STATIC_CHAT_MODEL_IDS].sort();
    }
  },

  validateApiKey: async (apiKey: string, _baseUrl?: string) => {
    try {
      const provider = new ZAIProvider();
      return await provider.validateApiKey(apiKey);
    } catch (error) {
      logger.error(
        'Error validating Z.AI API key',
        { context: 'plugin.validateApiKey' },
        error instanceof Error ? error : undefined
      );
      return false;
    }
  },

  /**
   * Static model info. Context windows below are per Z.AI's published
   * specifications where available; vision models have a reduced context
   * window relative to text-only siblings.
   */
  getModelInfo: () => STATIC_MODELS,

  /**
   * Z.AI uses OpenAI-compatible function tool format — pass through as-is.
   * Z.AI's native web_search tool is attached separately at send time
   * when params.webSearchEnabled is true.
   */
  formatTools: (
    tools: (OpenAIToolDefinition | Record<string, unknown>)[]
  ): OpenAIToolDefinition[] => {
    try {
      const formatted: OpenAIToolDefinition[] = [];
      for (const tool of tools) {
        if (!('function' in tool)) {
          logger.warn('Skipping tool with invalid format', { context: 'plugin.formatTools' });
          continue;
        }
        formatted.push(tool as OpenAIToolDefinition);
      }
      return formatted;
    } catch (error) {
      logger.error(
        'Error formatting tools for Z.AI',
        { context: 'plugin.formatTools' },
        error instanceof Error ? error : undefined
      );
      return [];
    }
  },

  parseToolCalls: (response: unknown): ToolCallRequest[] => {
    try {
      return parseOpenAIToolCalls(response);
    } catch (error) {
      logger.error(
        'Error parsing tool calls from Z.AI response',
        { context: 'plugin.parseToolCalls' },
        error instanceof Error ? error : undefined
      );
      return [];
    }
  },

  getImageProviderConstraints: (): ImageProviderConstraints => Z_AI_IMAGE_CONSTRAINTS,

  hasTextToolMarkers(text: string): boolean {
    return hasAnyXMLToolMarkers(text);
  },

  parseTextToolCalls(text: string): ToolCallRequest[] {
    try {
      return parseAllXMLAsToolCalls(text);
    } catch (error) {
      logger.error(
        'Error parsing text tool calls',
        { context: 'z-ai.parseTextToolCalls' },
        error instanceof Error ? error : undefined
      );
      return [];
    }
  },

  stripTextToolMarkers(text: string): string {
    return stripAllXMLToolMarkers(text);
  },
};

export default plugin;
