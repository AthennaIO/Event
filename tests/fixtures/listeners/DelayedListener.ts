/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Listener, type Context } from '#src'

@Listener({ delay: 60 })
export class DelayedListener {
  public static runs: Context[] = []

  public async handle(ctx: Context) {
    DelayedListener.runs.push(ctx)
  }
}
