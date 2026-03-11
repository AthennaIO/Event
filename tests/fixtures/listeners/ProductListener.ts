/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Listener, type Context } from '#src'
import { constants } from '#tests/fixtures/constants/index'

@Listener({ connection: 'memory' })
export class ProductListener {
  public async handle(ctx: Context) {
    if (ctx.data.failOnAllAttempts) {
      throw new Error('testing')
    }

    if (ctx.data.failOnFirstAttemptOnly && ctx.attempts >= 1) {
      throw new Error('testing')
    }

    constants.PRODUCTS.push(ctx.data)
    constants.RUN_MAP.productListener = true
  }
}
