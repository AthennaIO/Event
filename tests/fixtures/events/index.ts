/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Event } from '#src'
import { constants } from '#tests/fixtures/constants/index'

Event.on('annotatedListener', 'annotatedListener')
Event.on('helloListener', 'HelloListener')
Event.on('productListener', 'ProductListener')

Event.on('closureListener', ctx => {
  constants.RUN_MAP.closureListener = true
  constants.LAST_EVENT = ctx
})
