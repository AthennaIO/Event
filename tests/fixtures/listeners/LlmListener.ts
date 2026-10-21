/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Listener, type Context } from '#src'

@Listener({ connection: 'memoryLlm' })
export class LlmListener {
  public static runs: Context[] = []

  public async handle(ctx: Context) {
    LlmListener.runs.push(ctx)
  }
}
