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
    }
  }
}
