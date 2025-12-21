/**
 * Request Queue for Sequential Tool Execution
 * Ensures only one tool runs at a time to prevent resource conflicts
 */

export type QueuedTask<T> = () => Promise<T>;

interface QueueItem<T> {
  task: QueuedTask<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Sequential execution queue that processes tasks one at a time
 */
export class RequestQueue {
  private queue: QueueItem<unknown>[] = [];
  private isProcessing = false;
  private currentTask: string | null = null;

  /**
   * Add a task to the queue and wait for its completion
   */
  async enqueue<T>(task: QueuedTask<T>, _taskName?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task: task as QueuedTask<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.processQueue();
    });
  }

  /**
   * Process the queue one task at a time
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      try {
        const result = await item.task();
        item.resolve(result);
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.isProcessing = false;
    this.currentTask = null;
  }

  /**
   * Get the current queue length
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Check if the queue is currently processing
   */
  get busy(): boolean {
    return this.isProcessing;
  }

  /**
   * Get the name of the currently executing task
   */
  get current(): string | null {
    return this.currentTask;
  }

  /**
   * Clear all pending tasks from the queue
   */
  clear(): void {
    const error = new Error('Queue cleared');
    for (const item of this.queue) {
      item.reject(error);
    }
    this.queue = [];
  }
}

// Singleton instance for global tool execution queue
let globalQueue: RequestQueue | null = null;

/**
 * Get the global request queue instance
 */
export function getGlobalQueue(): RequestQueue {
  if (!globalQueue) {
    globalQueue = new RequestQueue();
  }
  return globalQueue;
}

/**
 * Execute a tool through the global queue
 */
export async function executeQueued<T>(
  task: QueuedTask<T>,
  taskName?: string
): Promise<T> {
  return getGlobalQueue().enqueue(task, taskName);
}

/**
 * Decorator to queue a function's execution
 */
export function queued<T extends (...args: unknown[]) => Promise<unknown>>(
  target: T,
  taskName?: string
): T {
  return (async (...args: Parameters<T>) => {
    return executeQueued(() => target(...args), taskName);
  }) as T;
}
