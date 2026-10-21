/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Listener, type Context } from '#src'

@Listener({ connection: 'memoryB', queue: 'annotation-queue' })
export class ViaMethodsListener {
  public static runs: Context[] = []

  public viaConnection() {
    return 'memoryLlm'
  }

  public viaQueue() {
    return 'via-method-queue'
  }

  public async handle(ctx: Context) {
    ViaMethodsListener.runs.push(ctx)
  }
}
