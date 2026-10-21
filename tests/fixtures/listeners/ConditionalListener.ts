/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Listener, type Context, type EmitContext } from '#src'

@Listener()
export class ConditionalListener {
  public static runs: Context[] = []

  public shouldQueue(ctx: EmitContext<{ vip: boolean }>) {
    return ctx.data.vip
  }

  public async handle(ctx: Context) {
    ConditionalListener.runs.push(ctx)
  }
}
