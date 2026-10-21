/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { EmitContext } from '#src/types/EmitContext'

/**
 * The delay of a listener, the same contract of `Queue.later()`: a `number`
 * is the delay in milliseconds from the emission and a `Date` is the exact
 * instant when the listener runs. A function is called at `emit()` time
 * and may return any of them, or `null`/`undefined` to run without delay.
 */
export type ListenerDelay<T = any> =
  | number
  | Date
  | ((
      ctx: EmitContext<T>
    ) =>
      | number
      | Date
      | null
      | undefined
      | Promise<number | Date | null | undefined>)
