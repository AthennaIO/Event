/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

export default {
  default: 'memoryA',

  connections: {
    memoryA: {
      driver: 'memory',
      queue: 'events-a',
      deadletter: 'events-a-deadletter',
      attempts: 2,
      workerInterval: 1
    },

    memoryB: {
      driver: 'memory',
      queue: 'events-b',
      deadletter: 'events-b-deadletter',
      attempts: 2,
      workerInterval: 1
    },

    memoryConcurrent: {
      driver: 'memory',
      queue: 'events-concurrent',
      deadletter: 'events-concurrent-deadletter',
      attempts: 2,
      workerInterval: 1,
      workerConcurrency: 3
    },

    /**
     * The connection declared by the `@Listener()` fixtures loaded from the
     * `listeners` of the rc file.
     */
    memory: {
      driver: 'memory',
      queue: 'events',
      deadletter: 'events-deadletter',
      attempts: 2,
      workerInterval: 1
    },

    memoryLlm: {
      driver: 'memory',
      queue: 'events-llm',
      deadletter: 'events-llm-deadletter',
      attempts: 1,
      workerInterval: 1
    },

    sqsLike: {
      driver: 'fake',
      queue: 'events-sqs',
      deadletter: 'events-sqs-deadletter'
    }
  }
}
