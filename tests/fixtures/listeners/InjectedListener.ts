/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Listener, type Context, type EmitContext } from '#src'

@Listener({ connection: 'memoryLlm' })
export class InjectedListener {
  public static runs: Context[] = []
  public static constructed = 0

  public constructor(public notificationService: any) {
    InjectedListener.constructed++
  }

  public withDelay(ctx: EmitContext<{ delay: number }>) {
    return ctx.data.delay
  }

  public async handle(ctx: Context) {
    InjectedListener.runs.push(ctx)
  }
}
