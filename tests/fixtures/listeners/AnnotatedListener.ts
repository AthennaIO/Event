/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Listener } from '#src'
import { constants } from '#tests/fixtures/constants/index'

@Listener({
  type: 'singleton',
  alias: 'decoratedListener',
  camelAlias: 'annotatedListener'
})
export class AnnotatedListener {
  public async handle() {
    constants.RUN_MAP.decoratedListener = true
    constants.RUN_MAP.annotatedListener = true
  }
}
