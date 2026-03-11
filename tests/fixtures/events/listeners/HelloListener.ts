/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { constants } from '#tests/fixtures/constants/index'
import { Listener } from '#src'

@Listener({ connection: 'memoryA' })
export class HelloListener {
  public async handle() {
    constants.RUN_MAP.helloListener = true
  }
}
