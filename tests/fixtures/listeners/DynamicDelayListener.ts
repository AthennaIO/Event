/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Listener, type Context, type EmitContext } from '#src'

@Listener({ delay: 10000 })
export class DynamicDelayListener {
  public static runs: Context[] = []
  public static delayContexts: EmitContext[] = []

  public withDelay(ctx: EmitContext<{ delay?: number; at?: number }>) {
    DynamicDelayListener.delayContexts.push(ctx)

    if (ctx.data.at) {
      return new Date(ctx.data.at)
    }

    return ctx.data.delay
  }

  public async handle(ctx: Context) {
    DynamicDelayListener.runs.push(ctx)
  }
}
