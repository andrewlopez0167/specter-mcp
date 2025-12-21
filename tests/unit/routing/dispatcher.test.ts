import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModelDispatcher,
  ModelConfig,
  TaskType,
} from '../../../src/routing/dispatcher.js';

describe('ModelDispatcher', () => {
  let dispatcher: ModelDispatcher;

  beforeEach(() => {
    dispatcher = new ModelDispatcher();
  });

  describe('getConfig', () => {
    it('should return log_analysis config for log tasks', () => {
      const config = dispatcher.getConfig('log_analysis');
      expect(config.model).toBe('claude-3-haiku-20240307');
      expect(config.temperature).toBe(0);
    });

    it('should return vision config for vision tasks', () => {
      const config = dispatcher.getConfig('vision');
      expect(config.model).toBe('claude-3-5-sonnet-20241022');
      expect(config.temperature).toBe(0.2);
    });

    it('should return crash_analysis config for crash tasks', () => {
      const config = dispatcher.getConfig('crash_analysis');
      expect(config.model).toBe('claude-3-haiku-20240307');
    });

    it('should return primary model when disabled', () => {
      dispatcher.setEnabled(false);
      const config = dispatcher.getConfig('log_analysis');
      expect(config.model).toBe('claude-3-5-sonnet-20241022');
    });
  });

  describe('dispatch', () => {
    it('should call processor with correct config', async () => {
      let receivedConfig: ModelConfig | null = null;

      const result = await dispatcher.dispatch('log_analysis', async (config) => {
        receivedConfig = config;
        return 'success';
      });

      expect(receivedConfig).not.toBeNull();
      expect(receivedConfig!.model).toBe('claude-3-haiku-20240307');
      expect(result.result).toBe('success');
      expect(result.fallback).toBe(false);
    });

    it('should fallback to primary model on error', async () => {
      let attempts = 0;

      const result = await dispatcher.dispatch('log_analysis', async (config) => {
        attempts++;
        if (config.model === 'claude-3-haiku-20240307') {
          throw new Error('Worker unavailable');
        }
        return 'fallback success';
      });

      expect(attempts).toBe(2);
      expect(result.result).toBe('fallback success');
      expect(result.fallback).toBe(true);
      expect(result.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should throw if both worker and primary fail', async () => {
      await expect(
        dispatcher.dispatch('log_analysis', async () => {
          throw new Error('All models failed');
        })
      ).rejects.toThrow('All models failed');
    });

    it('should not retry if already using primary model', async () => {
      let attempts = 0;

      await expect(
        dispatcher.dispatch('code_reasoning', async () => {
          attempts++;
          throw new Error('Primary failed');
        })
      ).rejects.toThrow('Primary failed');

      // code_reasoning uses primary model, so should only try once
      expect(attempts).toBe(1);
    });
  });

  describe('setConfig', () => {
    it('should update config for a task type', () => {
      const newConfig: ModelConfig = {
        model: 'custom-model',
        temperature: 0.5,
        maxTokens: 500,
      };

      dispatcher.setConfig('log_analysis', newConfig);
      const config = dispatcher.getConfig('log_analysis');

      expect(config.model).toBe('custom-model');
      expect(config.temperature).toBe(0.5);
      expect(config.maxTokens).toBe(500);
    });
  });

  describe('enabled state', () => {
    it('should be enabled by default', () => {
      expect(dispatcher.isEnabled()).toBe(true);
    });

    it('should use primary model when disabled', async () => {
      dispatcher.setEnabled(false);

      let usedModel: string = '';
      await dispatcher.dispatch('log_analysis', async (config) => {
        usedModel = config.model;
        return 'result';
      });

      expect(usedModel).toBe('claude-3-5-sonnet-20241022');
    });
  });

  describe('custom initialization', () => {
    it('should accept custom configs', () => {
      const customDispatcher = new ModelDispatcher({
        configs: {
          log_analysis: {
            model: 'custom-log-model',
            temperature: 0.1,
          },
        },
      });

      const config = customDispatcher.getConfig('log_analysis');
      expect(config.model).toBe('custom-log-model');

      // Other configs should use defaults
      const visionConfig = customDispatcher.getConfig('vision');
      expect(visionConfig.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should accept custom primary model', () => {
      const customDispatcher = new ModelDispatcher({
        primaryModel: {
          model: 'custom-primary',
          temperature: 0,
        },
        enabled: false,
      });

      const config = customDispatcher.getConfig('log_analysis');
      expect(config.model).toBe('custom-primary');
    });
  });
});
