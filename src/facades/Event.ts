/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Facade } from '@athenna/ioc'
import type { EventImpl } from '#src/events/EventImpl'

export const Event = Facade.createFor<EventImpl>('Athenna/Core/Event')
