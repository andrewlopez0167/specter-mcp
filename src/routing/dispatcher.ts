/**
 * Model Dispatcher for routing tasks to appropriate AI models
 * Implements the Primary Agent + Specialized Worker pattern
 */

export type TaskType = 'log_analysis' | 'vision' | 'code_reasoning' | 'crash_analysis';

export interface ModelConfig {
  model: string;
  temperature: number;
  maxTokens?: number;
}

export interface DispatchResult<T> {
  result: T;
  model: string;
  fallback: boolean;
}

/**
 * Default model configurations by task type
 */
const DEFAULT_CONFIGS: Record<TaskType, ModelConfig> = {
  log_analysis: {
    model: 'claude-3-haiku-20240307',
    temperature: 0,
    maxTokens: 1000,
  },
  vision: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.2,
    maxTokens: 2000,
  },
  code_reasoning: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0,
    maxTokens: 4000,
  },
  crash_analysis: {
    model: 'claude-3-haiku-20240307',
    temperature: 0,
    maxTokens: 1500,
  },
};

/**
 * Primary model used when workers are unavailable
 */
const PRIMARY_MODEL: ModelConfig = {
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0,
  maxTokens: 4000,
};

/**
 * Model Dispatcher class
 * Routes tasks to specialized models with fallback to primary
 */
export class ModelDispatcher {
  private configs: Record<TaskType, ModelConfig>;
  private primaryModel: ModelConfig;
  private enabled: boolean;

  constructor(options?: {
    configs?: Partial<Record<TaskType, ModelConfig>>;
    primaryModel?: ModelConfig;
    enabled?: boolean;
  }) {
    this.configs = { ...DEFAULT_CONFIGS, ...options?.configs };
    this.primaryModel = options?.primaryModel ?? PRIMARY_MODEL;
    this.enabled = options?.enabled ?? true;
  }

  /**
   * Get the model configuration for a task type
   */
  getConfig(taskType: TaskType): ModelConfig {
    if (!this.enabled) {
      return this.primaryModel;
    }
    return this.configs[taskType] ?? this.primaryModel;
  }

  /**
   * Dispatch a task to the appropriate model
   * This is a stub that processes locally - in production,
   * this would call the appropriate AI API
   */
  async dispatch<T>(
    taskType: TaskType,
    processor: (config: ModelConfig) => Promise<T>
  ): Promise<DispatchResult<T>> {
    const config = this.getConfig(taskType);

    try {
      const result = await processor(config);
      return {
        result,
        model: config.model,
        fallback: false,
      };
    } catch (error) {
      // Fallback to primary model if worker fails
      if (config.model !== this.primaryModel.model) {
        console.warn(
          `[dispatcher] Worker model ${config.model} failed, falling back to primary`
        );

        try {
          const result = await processor(this.primaryModel);
          return {
            result,
            model: this.primaryModel.model,
            fallback: true,
          };
        } catch (fallbackError) {
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  /**
   * Update configuration for a task type
   */
  setConfig(taskType: TaskType, config: ModelConfig): void {
    this.configs[taskType] = config;
  }

  /**
   * Enable or disable model routing (uses primary model when disabled)
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if model routing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
let globalDispatcher: ModelDispatcher | null = null;

/**
 * Get the global model dispatcher instance
 */
export function getDispatcher(): ModelDispatcher {
  if (!globalDispatcher) {
    globalDispatcher = new ModelDispatcher();
  }
  return globalDispatcher;
}

/**
 * Dispatch a task using the global dispatcher
 */
export async function dispatchTask<T>(
  taskType: TaskType,
  processor: (config: ModelConfig) => Promise<T>
): Promise<DispatchResult<T>> {
  return getDispatcher().dispatch(taskType, processor);
}
