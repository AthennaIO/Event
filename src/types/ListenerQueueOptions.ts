/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { ListenerDelay } from '#src/types/ListenerDelay'

export type ListenerQueueOptions = {
  /**
   * The queue connection where the jobs of the listener are stored and
   * consumed. When not defined, the listener follows the connection
   * selected with `Event.store()`, which defaults to `event.store`.
   *
   * @default Config.get('event.store')
   */
  connection?: string

  /**
   * The queue where the jobs of the listener are stored. When not defined,
   * `memory` and `database` connections store each listener in its own
   * queue (`{connectionQueue}:{listenerName}`) and other drivers use the
   * queue of the connection.
   *
   * @default '{connectionQueue}:{listenerName}'
   */
  queue?: string

  /**
   * Delay the listener execution. A `number` is the delay in milliseconds
   * from the emission and a `Date` is the exact instant. A function is
   * called at `emit()` time with the `EmitContext` and may return any of
   * them, or `null`/`undefined` to run without delay.
   *
   * @default undefined
   */
  delay?: ListenerDelay
}
